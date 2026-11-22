import { one, q } from "../db.js";
import { bumpBuyer, bumpSeller } from "./trust.js";
import { log, notify, notifySeller } from "./events.js";
import { config } from "../config.js";

export const VALID_TRANSITIONS = {
  created: ["payment_pending", "held", "cancelled"],
  payment_pending: ["held", "cancelled", "created"],
  held: ["shipped", "cancelled", "refunded", "disputed"],
  shipped: ["in_transit", "delivered", "refused", "returned", "disputed"],
  in_transit: ["delivered", "refused", "returned", "disputed"],
  delivered: ["released", "return_requested", "disputed"],
  return_requested: ["return_shipped", "disputed", "cancelled", "refunded"],
  return_shipped: ["return_received", "delivered", "returned", "refunded", "disputed"],
  return_received: ["refunded", "disputed"],
  disputed: ["released", "refunded", "return_requested", "delivered", "held"],
  released: [],
  refunded: [],
  cancelled: [],
};

export function assertTransition(fromStatus, toStatus, actor = "system") {
  if (actor === "admin") return true; // Admin has override authority
  const allowed = VALID_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new Error(`Invalid deal status transition from '${fromStatus}' to '${toStatus}'`);
  }
  return true;
}

export async function getSetting(key, fallback) {
  const row = await one("select value from settings where key=$1", [key]);
  return row ? row.value : fallback;
}

export async function getPublicSettings() {
  const rows = await q("select key, value from settings");
  const map = {
    platform_fee_percent: String(config.feePercent || 2),
    platform_fee_min: String(config.feeMin || 10),
    confirm_window_hours: String(config.confirmWithinHours || 72),
    ship_within_hours: String(config.shipWithinHours || 48),
    return_deduct_shipping: "true",
    escrow_bkash_merchant: "01711-000000",
    escrow_nagad_merchant: "01911-000000",
    escrow_rocket_merchant: "01811-000000",
    escrow_bank_name: "City Bank Ltd (Gulshan Branch)",
    escrow_bank_account: "PakkaDeal Escrow Services Ltd (A/C: 150239482001)",
    escrow_payment_instructions: "বিকাশ বা নগদ অ্যাপের 'Make Payment' অপশন থেকে পাক্কাডিল অফিসিয়াল এসক্রো মার্চেন্ট নাম্বারে সম্পূর্ণ টাকা পেমেন্ট করুন। এরপর প্রাপ্ত Transaction ID (TrxID) এবং আপনার প্রেরক নম্বর নিচে বসিয়ে কনফার্ম করুন। টাকা সরাসরি পাক্কা ডিল এসক্রো ভল্টে সুরক্ষিত থাকবে।",
  };
  for (const r of rows || []) {
    map[r.key] = r.value;
  }
  return map;
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
export async function applyPayment(deal, paymentOpts = "bKash") {
  assertTransition(deal.status, "held", "buyer");
  const shipHours = Number(await getSetting("ship_within_hours", config.shipWithinHours));
  const shipBy = new Date(Date.now() + shipHours * 36e5).toISOString();

  const paymentMethod = typeof paymentOpts === "object" ? (paymentOpts.paymentMethod || "bKash") : paymentOpts;
  const senderNumber = typeof paymentOpts === "object" ? (paymentOpts.senderNumber || deal.buyer_phone) : deal.buyer_phone;
  const trxId = typeof paymentOpts === "object" ? (paymentOpts.trxId || `TX-${Date.now().toString(36).toUpperCase()}`) : `TX-${Date.now().toString(36).toUpperCase()}`;

  await q(
    `update deals set
       status='held', deposit=$2, ship_by=$3, payment_method=$4, payment_sender=$5, payment_trx_id=$6, updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, deal.total_amount, shipBy, paymentMethod, senderNumber, trxId]
  );

  await addLedger({
    dealId: deal.id,
    type: "hold",
    amount: deal.total_amount,
    partyPhone: senderNumber || deal.buyer_phone,
    notes: `Escrow hold funded via ${paymentMethod} (Sender: ${senderNumber || deal.buyer_phone}, TrxID: ${trxId})`,
  });

  await log(deal.id, "paid", `Buyer deposited ${deal.total_amount} BDT into escrow via ${paymentMethod}. TrxID: ${trxId}, Sender: ${senderNumber || deal.buyer_phone}`, {
    fromStatus: deal.status,
    toStatus: "held",
    actor: "buyer",
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal: Payment confirmed (${deal.total_amount} BDT) for deal #${deal.code}. TrxID: ${trxId}. Funds are safely held in PakkaDeal Escrow Vault.`,
    "Escrow Payment Confirmed",
    deal.code
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal: Buyer has paid ${deal.total_amount} BDT into escrow for deal #${deal.code}. Buyer has paid, you can ship now within ${shipHours} hours.`,
    "Buyer Paid – Ship Parcel Now",
    deal.code
  );

  return one("select * from deals where id=$1", [deal.id]);
}

/** Seller dispatches courier (Steadfast, Pathao, RedX, Paperfly or Other/Manual) */
export async function applyShip(deal, courierArg, trackingArg, extraOpts = {}) {
  assertTransition(deal.status, "shipped", "seller");

  let courierName = "Steadfast";
  let trackingId = "";
  let isManualCourier = false;
  let courierPhone = "";
  let consignmentSlip = null;
  let consignmentSlipType = "";

  if (typeof courierArg === "object" && courierArg !== null) {
    courierName = courierArg.courierName || "Steadfast";
    trackingId = courierArg.trackingId || "";
    isManualCourier = !!courierArg.isManualCourier;
    courierPhone = courierArg.courierPhone || "";
    consignmentSlip = courierArg.consignmentSlip || null;
    consignmentSlipType = courierArg.consignmentSlipType || "";
  } else {
    courierName = courierArg || "Steadfast";
    trackingId = trackingArg || "";
    isManualCourier = !!extraOpts.isManualCourier;
    courierPhone = extraOpts.courierPhone || "";
    consignmentSlip = extraOpts.consignmentSlip || null;
    consignmentSlipType = extraOpts.consignmentSlipType || "";
  }

  let newRiskScore = deal.risk_score || 0;
  let manualAuditStatus = "none";

  if (isManualCourier || String(courierName).toLowerCase() === "other") {
    newRiskScore += 15;
    manualAuditStatus = "pending";
    isManualCourier = true;
  }

  await q(
    `update deals set
       status='shipped',
       courier_name=$2,
       tracking_id=$3,
       courier_status='in_transit',
       is_manual_courier=$4,
       courier_phone=$5,
       consignment_slip=$6,
       consignment_slip_type=$7,
       manual_audit_status=$8,
       risk_score=$9,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [
      deal.id,
      courierName,
      trackingId,
      isManualCourier ? 1 : 0,
      courierPhone,
      consignmentSlip,
      consignmentSlipType,
      manualAuditStatus,
      newRiskScore,
    ]
  );

  const noteMsg = isManualCourier
    ? `Dispatched via manual courier "${courierName}" (Phone: ${courierPhone || "N/A"}, Tracking: ${trackingId}). Consignment slip submitted for admin audit.`
    : `Dispatched via ${courierName} (Tracking ID: ${trackingId})`;

  await log(deal.id, "shipped", noteMsg, {
    fromStatus: deal.status,
    toStatus: "shipped",
    actor: "seller",
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: Parcel dispatched with ${courierName} (${trackingId}). Track shipment online.`,
    "Parcel Shipped",
    deal.code
  );

  return one("select * from deals where id=$1", [deal.id]);
}

/** Courier status updates (from webhook or polling) */
export async function applyCourier(deal, status) {
  if (deal.status !== "shipped" && deal.status !== "in_transit" && deal.status !== "return_shipped") {
    return deal;
  }

  // Return shipment handling
  if (deal.status === "return_shipped") {
    if (status === "delivered") {
      return completeReturn(deal, "courier");
    }
    await q("update deals set return_courier_status=$1, updated_at=CURRENT_TIMESTAMP where id=$2", [status, deal.id]);
    await log(deal.id, "return_tracking", `Return courier status: ${status}`, {
      fromStatus: deal.status,
      toStatus: deal.status,
      actor: "courier",
    });
    return one("select * from deals where id=$1", [deal.id]);
  }

  // Normal outbound delivery flow
  if (status === "picked_up" || status === "in_transit") {
    await q("update deals set status='in_transit', courier_status=$1, updated_at=CURRENT_TIMESTAMP where id=$2", [status, deal.id]);
    await log(deal.id, "in_transit", `Courier tracking update: ${status.replace("_", " ")}`, {
      fromStatus: deal.status,
      toStatus: "in_transit",
      actor: "courier",
    });
    return one("select * from deals where id=$1", [deal.id]);
  }

  if (status === "delivered") {
    // Inspection window starts on delivery
    const autoReleaseHours = Number(await getSetting("confirm_window_hours", config.confirmWithinHours || 72));
    const autoReleaseAt = new Date(Date.now() + autoReleaseHours * 36e5).toISOString();

    await q(
      `update deals set
         status='delivered',
         courier_status='delivered',
         confirm_by=$2,
         auto_release_at=$2,
         auto_release_paused=0,
         updated_at=CURRENT_TIMESTAMP
       where id=$1`,
      [deal.id, autoReleaseAt]
    );

    await log(
      deal.id,
      "delivered",
      `Courier marked parcel delivered. ${autoReleaseHours}-hour auto-release countdown started. Buyer has ${autoReleaseHours} hours to inspect item and confirm receipt.`,
      {
        fromStatus: deal.status,
        toStatus: "delivered",
        actor: "courier",
      }
    );

    await notify(
      deal.buyer_phone,
      `PakkaDeal #${deal.code}: Delivered! Please inspect item and confirm receipt in your dashboard within 24 hours before automatic fund release.`,
      "Parcel Delivered – 24h Review Window",
      deal.code
    );

    await notifySeller(
      deal.seller_id,
      `PakkaDeal #${deal.code}: Courier confirmed delivery to buyer. 24-hour confirmation countdown is now active.`,
      "Delivery Confirmed",
      deal.code
    );

    return one("select * from deals where id=$1", [deal.id]);
  }

  if (status === "refused" || status === "returned") {
    // Buyer refused parcel at doorstep
    await q(
      `update deals set status='released', outcome='refused_at_door', courier_status='refused', updated_at=CURRENT_TIMESTAMP where id=$1`,
      [deal.id]
    );

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
    await log(deal.id, "refused", `Buyer refused parcel at doorstep. Shipping compensation released to seller, remaining balance refunded to buyer.`, {
      fromStatus: deal.status,
      toStatus: "released",
      actor: "courier",
    });

    await notify(
      deal.buyer_phone,
      `PakkaDeal #${deal.code}: Order refused at doorstep. Refund of ${buyerRefund} BDT processed after delivery charges.`,
      "Order Refused – Refund Processed",
      deal.code
    );

    await notifySeller(
      deal.seller_id,
      `PakkaDeal #${deal.code}: Order refused at doorstep. Shipping charge compensation (${deliveryAndReturn} BDT) released to your account.`,
      "Order Refused",
      deal.code
    );

    return one("select * from deals where id=$1", [deal.id]);
  }

  return deal;
}

/** Buyer confirms receipt or auto-release timer completes */
export async function releaseToSeller(deal, outcome = "buyer_confirmed", actor = "buyer", proofOpts = {}) {
  assertTransition(deal.status, "released", actor);

  // Requirement: Seller bKash must be verified by admin before payout can be released
  const seller = await one("select * from users where id=$1", [deal.seller_id]);
  if (!seller || !seller.bkash_verified) {
    throw new Error("Seller bKash account is not verified by admin. Payout cannot be released until seller's bKash is verified.");
  }

  const payout = deal.seller_payout || (deal.price + (deal.delivery_charge || 0));
  const fee = deal.fee_amount || Math.max(0, deal.total_amount - payout);

  const unboxingPhoto = proofOpts.unboxingPhoto || null;
  const unboxingPhotoType = proofOpts.unboxingPhotoType || "";

  await q(
    `update deals set
       status='released',
       outcome=$2,
       auto_release_paused=1,
       unboxing_photo=coalesce($3, unboxing_photo),
       unboxing_photo_type=case when $3 is not null then $4 else unboxing_photo_type end,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, outcome, unboxingPhoto, unboxingPhotoType]
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
    notes: `Platform service fee for deal #${deal.code}`,
  });

  await bumpBuyer(deal.buyer_phone, "delivered");
  await bumpSeller(deal.seller_id, "completed");

  const noteMsg = outcome === "auto_release_timeout"
    ? "24-hour confirmation window expired. Escrow funds auto-released to seller."
    : `Buyer confirmed receipt${unboxingPhoto ? " with unboxing proof" : ""}. Money released to seller.`;

  await log(deal.id, "released", noteMsg, {
    fromStatus: deal.status,
    toStatus: "released",
    actor: actor,
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: Deal successfully completed. Thank you for using PakkaDeal Escrow!`,
    "Deal Completed",
    deal.code
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: ${payout.toLocaleString()} BDT released to your account in full.`,
    "Funds Released to Seller",
    deal.code
  );

  return one("select * from deals where id=$1", [deal.id]);
}

/** Buyer requests a return */
export async function requestReturn(deal, reason, actor = "buyer") {
  assertTransition(deal.status, "return_requested", actor);

  await q(
    `update deals set
       status='return_requested',
       outcome='return_requested',
       auto_release_paused=1,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id]
  );

  await log(deal.id, "return_requested", `Buyer requested return: ${reason}. Auto-release countdown stopped.`, {
    fromStatus: deal.status,
    toStatus: "return_requested",
    actor: actor,
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: Return request submitted. Please ship item back to seller and input return tracking ID.`,
    "Return Requested",
    deal.code
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: Buyer requested return (${reason}). Auto-release paused. Awaiting buyer return shipment.`,
    "Return Requested by Buyer",
    deal.code
  );

  return one("select * from deals where id=$1", [deal.id]);
}

/** Buyer ships return parcel */
export async function shipReturn(deal, courierName, trackingId, actor = "buyer") {
  assertTransition(deal.status, "return_shipped", actor);

  await q(
    `update deals set
       status='return_shipped',
       return_courier_name=$2,
       return_tracking_id=$3,
       return_courier_status='in_transit',
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, courierName, trackingId]
  );

  await log(deal.id, "return_shipped", `Buyer dispatched return via ${courierName} (Tracking ID: ${trackingId})`, {
    fromStatus: deal.status,
    toStatus: "return_shipped",
    actor: actor,
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: Return shipment recorded (${courierName} ${trackingId}). Seller will inspect on arrival.`,
    "Return Shipment Recorded",
    deal.code
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: Buyer dispatched return package via ${courierName} (${trackingId}). Please confirm receipt upon arrival.`,
    "Return Package Dispatched",
    deal.code
  );

  return one("select * from deals where id=$1", [deal.id]);
}

/** Complete return shipment and refund buyer (minus seller return charge if buyer_pays) */
export async function completeReturn(deal, actor = "seller") {
  assertTransition(deal.status, "refunded", actor);

  await q(
    `update deals set
       status='refunded',
       outcome='return_received',
       auto_release_paused=1,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id]
  );

  const returnDeduction = deal.return_policy === "buyer_pays" ? (deal.delivery_charge || 0) : 0;
  const refundAmount = Math.max(0, deal.total_amount - returnDeduction - deal.fee_amount);

  if (returnDeduction > 0) {
    await addLedger({
      dealId: deal.id,
      type: "payout_seller",
      amount: returnDeduction,
      notes: `Return shipping deduction credited to seller for #${deal.code}`,
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

  await log(deal.id, "refunded", `Return item received. Buyer refunded ${refundAmount.toLocaleString()} BDT (deductions: ${returnDeduction} BDT return fee).`, {
    fromStatus: deal.status,
    toStatus: "refunded",
    actor: actor,
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: Return verified. ${refundAmount.toLocaleString()} BDT refunded to you.`,
    "Return Refund Processed",
    deal.code
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: Return parcel delivery confirmed. Deal concluded.`,
    "Return Complete",
    deal.code
  );

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
    `update deals set seller_confirmed=$2, buyer_confirmed=$3, updated_at=CURRENT_TIMESTAMP where id=$1`,
    [deal.id, sellerConfirmed, buyerConfirmed]
  );

  await log(
    deal.id,
    "handover_confirmed",
    `${isSeller ? "Seller/Provider" : "Buyer/Client"} confirmed handover`,
    {
      fromStatus: deal.status,
      toStatus: deal.status,
      actor: isSeller ? "seller" : "buyer",
    }
  );

  if (sellerConfirmed && buyerConfirmed) {
    return releaseToSeller(deal, "both_confirmed", isSeller ? "seller" : "buyer");
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

/** Admin Force Release */
export async function adminForceRelease(deal, adminNotes = "", actor = "admin") {
  const seller = await one("select * from users where id=$1", [deal.seller_id]);
  if (!seller || !seller.bkash_verified) {
    throw new Error("Seller bKash account is not verified by admin. Payout cannot be released until seller's bKash is verified.");
  }

  const payout = deal.seller_payout || (deal.price + (deal.delivery_charge || 0));
  const fee = deal.fee_amount || Math.max(0, deal.total_amount - payout);

  await q(
    `update deals set status='released', outcome='admin_forced_release', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP where id=$1`,
    [deal.id]
  );

  await addLedger({
    dealId: deal.id,
    type: "payout_seller",
    amount: payout,
    notes: `Admin force released funds for #${deal.code}. Reason: ${adminNotes}`,
  });

  await addLedger({
    dealId: deal.id,
    type: "platform_fee",
    amount: fee,
    notes: `Platform service fee for #${deal.code}`,
  });

  await bumpSeller(deal.seller_id, "completed");

  await log(deal.id, "released", `Admin force released funds to seller. Notes: ${adminNotes || "Administrative clearance"}`, {
    fromStatus: deal.status,
    toStatus: "released",
    actor: "admin",
  });

  await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Administrative review completed. Funds released to seller.`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: ${payout.toLocaleString()} BDT released to your account by admin decision.`);

  return one("select * from deals where id=$1", [deal.id]);
}

/** Admin Force Refund */
export async function adminForceRefund(deal, adminNotes = "", actor = "admin") {
  const refundAmount = deal.total_amount;

  await q(
    `update deals set status='refunded', outcome='admin_forced_refund', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP where id=$1`,
    [deal.id]
  );

  await addLedger({
    dealId: deal.id,
    type: "refund_buyer",
    amount: refundAmount,
    partyPhone: deal.buyer_phone,
    notes: `Admin force refunded buyer for #${deal.code}. Reason: ${adminNotes}`,
  });

  await bumpSeller(deal.seller_id, "disputes");

  await log(deal.id, "refunded", `Admin force refunded deal to buyer. Notes: ${adminNotes || "Administrative refund"}`, {
    fromStatus: deal.status,
    toStatus: "refunded",
    actor: "admin",
  });

  await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Full refund of ${refundAmount.toLocaleString()} BDT processed by admin.`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Deal cancelled and refunded to buyer by admin decision.`);

  return one("select * from deals where id=$1", [deal.id]);
}

/** Admin Split Resolution */
export async function adminSplitResolution(deal, sellerAmount, buyerAmount, adminNotes = "", actor = "admin") {
  await q(
    `update deals set status='released', outcome='admin_split_resolution', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP where id=$1`,
    [deal.id]
  );

  if (sellerAmount > 0) {
    await addLedger({
      dealId: deal.id,
      type: "payout_seller",
      amount: sellerAmount,
      notes: `Admin split payout to seller for #${deal.code}. Reason: ${adminNotes}`,
    });
  }

  if (buyerAmount > 0) {
    await addLedger({
      dealId: deal.id,
      type: "refund_buyer",
      amount: buyerAmount,
      partyPhone: deal.buyer_phone,
      notes: `Admin split refund to buyer for #${deal.code}. Reason: ${adminNotes}`,
    });
  }

  await log(deal.id, "released", `Admin resolved via split payout: Seller ${sellerAmount} BDT, Buyer ${buyerAmount} BDT. Notes: ${adminNotes}`, {
    fromStatus: deal.status,
    toStatus: "released",
    actor: "admin",
  });

  await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Dispute resolved via split. ${buyerAmount} BDT refunded to you.`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Dispute resolved via split. ${sellerAmount} BDT released to you.`);

  return one("select * from deals where id=$1", [deal.id]);
}

/** Check automated timeouts: seller ship timeout or 24h buyer confirmation timeout */
export async function checkAllTimeouts() {
  const now = new Date().toISOString();

  // 1. Unshipped deals past ship_by -> auto full refund to buyer
  const lateDeals = await q(
    "select * from deals where status='held' and ship_by is not null and ship_by < $1",
    [now]
  );
  for (const deal of lateDeals) {
    await q(
      `update deals set status='refunded', outcome='seller_ship_timeout', updated_at=CURRENT_TIMESTAMP where id=$1`,
      [deal.id]
    );
    await addLedger({
      dealId: deal.id,
      type: "refund_buyer",
      amount: deal.total_amount,
      partyPhone: deal.buyer_phone,
      notes: `Auto refund: Seller did not ship within deadline for #${deal.code}`,
    });
    await bumpSeller(deal.seller_id, "refused");
    await log(deal.id, "refunded", "Seller did not ship within agreed deadline. Buyer fully refunded.", {
      fromStatus: "held",
      toStatus: "refunded",
      actor: "system",
    });
    await notify(
      deal.buyer_phone,
      `PakkaDeal #${deal.code}: Full refund of ${deal.total_amount.toLocaleString()} BDT processed because seller did not dispatch on time.`,
      "Auto Refund – Seller Missed Dispatch Deadline",
      deal.code
    );
    await notifySeller(
      deal.seller_id,
      `PakkaDeal #${deal.code}: Cancelled and buyer refunded due to shipping deadline expiration.`,
      "Deal Cancelled – Shipping Timeout",
      deal.code
    );
  }

  // 2. Delivered deals past auto_release_at (24 hours) where countdown is not paused -> auto release to seller
  const readyDeals = await q(
    `select * from deals
     where status='delivered'
       and auto_release_paused = 0
       and (
         (auto_release_at is not null and auto_release_at < $1)
         or (confirm_by is not null and confirm_by < $1)
       )`,
    [now]
  );
  for (const deal of readyDeals) {
    console.log(`[AUTO-RELEASE TIMER] 24-hour window elapsed for deal #${deal.code}. Auto-releasing funds to seller.`);
    await releaseToSeller(deal, "auto_release_timeout", "system");
  }
}
