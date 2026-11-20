import { one, q } from "../db.js";
import { bumpBuyer, bumpSeller } from "./trust.js";
import { log, notify, notifySeller } from "./events.js";
import { config } from "../config.js";

export async function getSetting(key, fallback) {
  const row = await one("select value from settings where key=$1", [key]);
  return row ? row.value : fallback;
}

export async function calculateFee(amount) {
  const feePercent = Number(await getSetting("platform_fee_percent", config.feePercent));
  const feeMin = Number(await getSetting("platform_fee_min", config.feeMin));
  const fee = Math.round((amount * feePercent) / 100);
  return Math.max(fee, feeMin);
}

/** Record ledger movement */
export async function addLedger({ dealId, type, amount, partyPhone, notes }) {
  await q(
    `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
     values($1, $2, $3, $4, $5, $6)`,
    [dealId || null, type, amount, partyPhone || "", 0, notes || ""]
  );
}

/** Buyer funds deal into escrow */
export async function applyPayment(deal, paymentMethod = "bKash") {
  if (deal.status !== "created") throw new Error("Deal cannot be paid in current status");
  const shipHours = Number(await getSetting("ship_within_hours", config.shipWithinHours));
  const shipBy = new Date(Date.now() + shipHours * 36e5).toISOString();

  await q(
    `update deals set status='held', deposit=$2, ship_by=$3, updated_at=datetime('now') where id=$1`,
    [deal.id, deal.total_amount, shipBy]
  );

  await addLedger({
    dealId: deal.id,
    type: "hold",
    amount: deal.total_amount,
    partyPhone: deal.buyer_phone,
    notes: `Escrow hold funded via ${paymentMethod} Sandbox`,
  });

  await log(deal.id, "paid", `Buyer deposited ${deal.total_amount} BDT into escrow via ${paymentMethod}`);
  await notify(deal.buyer_phone, `PakkaDeal: Funds held for deal ${deal.code}. Money is safe in escrow.`);
  await notifySeller(deal.seller_id, `PakkaDeal: Buyer deposited ${deal.total_amount} BDT for deal #${deal.code}. Please ship within ${shipHours} hours.`);

  return one("select * from deals where id=$1", [deal.id]);
}

/** Seller dispatches courier */
export async function applyShip(deal, courierName, trackingId) {
  if (deal.status !== "held") throw new Error("Deal is not ready to ship");
  await q(
    `update deals set status='shipped', courier_name=$2, tracking_id=$3, courier_status='in_transit', updated_at=datetime('now') where id=$1`,
    [deal.id, courierName, trackingId]
  );

  await log(deal.id, "shipped", `Dispatched via ${courierName} (Tracking ID: ${trackingId})`);
  await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Shipped with ${courierName} (${trackingId}). Track online.`);
  return one("select * from deals where id=$1", [deal.id]);
}

/** Courier status webhook updates */
export async function applyCourier(deal, status) {
  if (deal.status !== "shipped" && deal.status !== "return_shipped") return deal;

  if (deal.status === "return_shipped") {
    // Return delivery
    if (status === "delivered") {
      return completeReturn(deal);
    }
    await q("update deals set return_courier_status=$1, updated_at=datetime('now') where id=$2", [status, deal.id]);
    await log(deal.id, "return_tracking", `Return courier status: ${status}`);
    return one("select * from deals where id=$1", [deal.id]);
  }

  // Normal delivery flow
  if (status === "picked_up" || status === "in_transit") {
    await q("update deals set courier_status=$1, updated_at=datetime('now') where id=$2", [status, deal.id]);
    await log(deal.id, status, `Courier tracking update: ${status.replace("_", " ")}`);
    return one("select * from deals where id=$1", [deal.id]);
  }

  if (status === "delivered") {
    const confirmHours = Number(await getSetting("confirm_window_hours", config.confirmWithinHours));
    const confirmBy = new Date(Date.now() + confirmHours * 36e5).toISOString();

    await q(
      `update deals set status='delivered', courier_status='delivered', confirm_by=$2, updated_at=datetime('now') where id=$1`,
      [deal.id, confirmBy]
    );

    await log(deal.id, "delivered", `Courier marked parcel delivered. Buyer has ${confirmHours} hours to confirm receipt.`);
    await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Delivered! Please inspect item and confirm receipt in your dashboard within ${confirmHours / 24} days.`);
    await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Courier confirmed delivery to buyer.`);
    return one("select * from deals where id=$1", [deal.id]);
  }

  if (status === "refused" || status === "returned") {
    // Buyer refused parcel at doorstep
    await q(
      `update deals set status='released', outcome='refused_at_door', courier_status='refused', updated_at=datetime('now') where id=$1`,
      [deal.id]
    );

    // Return shipping rule:
    // Seller gets delivery charge + return compensation, buyer refunded balance
    const deliveryAndReturn = (deal.delivery_charge || 0) + (deal.return_charge || deal.delivery_charge || 0);
    const buyerRefund = Math.max(0, deal.total_amount - deliveryAndReturn - deal.fee_amount);

    if (deliveryAndReturn > 0) {
      await addLedger({
        dealId: deal.id,
        type: "payout_seller",
        amount: deliveryAndReturn,
        notes: `Delivery & return shipping compensation for refused order #${deal.code}`,
      });
    }

    if (deal.fee_amount > 0) {
      await addLedger({
        dealId: deal.id,
        type: "platform_fee",
        amount: deal.fee_amount,
        notes: `Platform service fee for #${deal.code}`,
      });
    }

    if (buyerRefund > 0) {
      await addLedger({
        dealId: deal.id,
        type: "refund_buyer",
        amount: buyerRefund,
        partyPhone: deal.buyer_phone,
        notes: `Refund after delivery deductions for refused order #${deal.code}`,
      });
    }

    await bumpBuyer(deal.buyer_phone, "refused");
    await log(deal.id, "refused", `Buyer refused parcel at doorstep. Delivery deductions applied.`);
    await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Order refused. Refund processed after delivery charge.`);
    await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Order refused at doorstep. Shipping charge released to you.`);
    return one("select * from deals where id=$1", [deal.id]);
  }
}

/** Buyer confirms receipt or auto-release timer completes */
export async function releaseToSeller(deal, outcome = "buyer_confirmed") {
  if (deal.status !== "delivered" && deal.status !== "held" && deal.status !== "shipped") {
    throw new Error("Deal is not eligible for release");
  }

  const payout = deal.seller_payout || (deal.total_amount - deal.fee_amount);
  const fee = deal.fee_amount || Math.max(10, Math.round(deal.total_amount * 0.02));

  await q(
    `update deals set status='released', outcome=$2, updated_at=datetime('now') where id=$1`,
    [deal.id, outcome]
  );

  await addLedger({
    dealId: deal.id,
    type: "payout_seller",
    amount: payout,
    notes: `Seller payout for deal #${deal.code}`,
  });

  await addLedger({
    dealId: deal.id,
    type: "platform_fee",
    amount: fee,
    notes: `Platform service fee (2%) for deal #${deal.code}`,
  });

  await bumpBuyer(deal.buyer_phone, "delivered");
  await bumpSeller(deal.seller_id, "completed");

  const noteMsg = outcome === "auto_release_timeout"
    ? "Auto-released to seller after confirmation window expired"
    : "Buyer confirmed receipt. Money released to seller.";

  await log(deal.id, "released", noteMsg);
  await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Deal completed. Thank you for using PakkaDeal.`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: ${payout} BDT released to your account.`);

  return one("select * from deals where id=$1", [deal.id]);
}

/** Rental / Service dual confirmation */
export async function applyHandoverConfirmation(deal, user) {
  const isSeller = user.id === deal.seller_id;
  const isBuyer = user.phone === deal.buyer_phone;
  if (!isSeller && !isBuyer) throw new Error("Unauthorized to confirm this deal");

  let sellerConfirmed = deal.seller_confirmed;
  let buyerConfirmed = deal.buyer_confirmed;

  if (isSeller) sellerConfirmed = 1;
  if (isBuyer) buyerConfirmed = 1;

  await q(
    `update deals set seller_confirmed=$2, buyer_confirmed=$3, updated_at=datetime('now') where id=$1`,
    [deal.id, sellerConfirmed, buyerConfirmed]
  );

  await log(deal.id, "handover_confirmed", `${isSeller ? "Seller/Provider" : "Buyer/Client"} confirmed handover`);

  if (sellerConfirmed && buyerConfirmed) {
    return releaseToSeller(deal, "both_confirmed");
  } else {
    const otherParty = isSeller ? deal.buyer_phone : null;
    if (otherParty) {
      await notify(otherParty, `PakkaDeal #${deal.code}: Other party confirmed completion. Please confirm in your dashboard to release funds.`);
    } else {
      await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Buyer confirmed completion. Please confirm to finalize payout.`);
    }
  }

  return one("select * from deals where id=$1", [deal.id]);
}

/** Complete return shipment */
export async function completeReturn(deal) {
  await q(
    `update deals set status='refunded', outcome='return_received', updated_at=datetime('now') where id=$1`,
    [deal.id]
  );

  const returnDeduction = deal.return_policy === "buyer_pays" ? (deal.delivery_charge || 0) : 0;
  const refundAmount = Math.max(0, deal.total_amount - returnDeduction - deal.fee_amount);

  if (returnDeduction > 0) {
    await addLedger({
      dealId: deal.id,
      type: "return_deduction",
      amount: returnDeduction,
      notes: `Return shipping deduction for #${deal.code}`,
    });
  }

  if (deal.fee_amount > 0) {
    await addLedger({
      dealId: deal.id,
      type: "platform_fee",
      amount: deal.fee_amount,
      notes: `Platform fee for returned deal #${deal.code}`,
    });
  }

  await addLedger({
    dealId: deal.id,
    type: "refund_buyer",
    amount: refundAmount,
    partyPhone: deal.buyer_phone,
    notes: `Refund to buyer after return received for #${deal.code}`,
  });

  await log(deal.id, "return_completed", "Return item delivered back to seller. Buyer refunded.");
  await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Return verified. ${refundAmount} BDT refunded to you.`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Return parcel delivered. Deal closed.`);

  return one("select * from deals where id=$1", [deal.id]);
}

/** Check automated timeouts: seller ship timeout or buyer confirmation timeout */
export async function checkAllTimeouts() {
  const now = new Date().toISOString();

  // 1. Unshipped deals past ship_by -> auto full refund to buyer
  const lateDeals = await q("select * from deals where status='held' and ship_by is not null and ship_by < $1", [now]);
  for (const deal of lateDeals) {
    await q("update deals set status='refunded', outcome='seller_ship_timeout', updated_at=datetime('now') where id=$1", [deal.id]);
    await addLedger({
      dealId: deal.id,
      type: "refund_buyer",
      amount: deal.total_amount,
      partyPhone: deal.buyer_phone,
      notes: `Auto refund: Seller did not ship within deadline for #${deal.code}`,
    });
    await bumpSeller(deal.seller_id, "refused");
    await log(deal.id, "refunded", "Seller did not ship within deadline. Buyer fully refunded.");
    await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Full refund of ${deal.total_amount} BDT processed because seller did not dispatch on time.`);
    await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Cancelled and buyer refunded due to shipping deadline expiration.`);
  }

  // 2. Delivered deals past confirm_by -> auto release to seller
  const readyDeals = await q("select * from deals where status='delivered' and confirm_by is not null and confirm_by < $1", [now]);
  for (const deal of readyDeals) {
    await releaseToSeller(deal, "auto_release_timeout");
  }
}
