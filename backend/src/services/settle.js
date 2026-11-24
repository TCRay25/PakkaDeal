import { one, q, transaction } from "../db.js";
import { bumpBuyer, bumpSeller } from "./trust.js";
import { log, notify, notifySeller } from "./events.js";
import { config } from "../config.js";
import { computeAmounts } from "./amounts.js";

export const VALID_TRANSITIONS = {
  created: ["payment_pending", "partially_funded", "held", "cancelled"],
  payment_pending: ["partially_funded", "held", "cancelled", "created"],
  partially_funded: ["partially_funded", "held", "shipped", "cancelled", "refunded"],
  held: ["shipped", "cancelled", "refunded", "disputed"],
  shipped: ["in_transit", "delivered", "refused", "returned", "disputed"],
  in_transit: ["delivered", "refused", "returned", "disputed"],
  delivered: ["released", "return_requested", "disputed"],
  return_requested: ["return_shipped", "disputed", "cancelled", "refunded"],
  return_shipped: ["return_received", "delivered", "returned", "refunded", "disputed"],
  return_received: ["refunded", "disputed"],
  disputed: ["released", "refunded", "return_requested", "delivered", "held", "refused"],
  refused: ["released", "refunded", "disputed", "cancelled"],
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
    platform_fee_percent: "1",
    platform_fee_min: "10",
    min_delivery_deposit: "60",
    refusal_review_hours: "24",
    confirm_window_hours: String(config.confirmWithinHours || 72),
    ship_within_hours: String(config.shipWithinHours || 48),
    trusted_max_discount_percent: "70",
    allow_early_ship: "false",
    seller_response_hours: "24",
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
  const feePercent = Number(await getSetting("platform_fee_percent", 1));
  const feeMin = Number(await getSetting("platform_fee_min", 10));
  const { fee_amount } = computeAmounts({
    dealType: "service",
    price: amount,
    feePercent,
    feeMin,
  });
  return fee_amount;
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

  return await transaction(async () => {
    const updated = await q(
      `update deals set
         status='held', deposit=$2, ship_by=$3, payment_method=$4, payment_sender=$5, payment_trx_id=$6,
         payment_status='confirmed', payment_amount=coalesce(nullif(payment_amount, 0), $2), updated_at=CURRENT_TIMESTAMP
       where id=$1 and status in ('created', 'payment_pending')
       returning *`,
      [deal.id, deal.total_amount, shipBy, paymentMethod, senderNumber, trxId]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

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

    return updated[0];
  });
}

/** Seller dispatches courier (Steadfast, Pathao, RedX, Paperfly or Other/Manual) */
export async function applyShip(deal, courierArg, trackingArg, extraOpts = {}) {
  if (deal.status === "partially_funded") {
    const allowEarly = (await getSetting("allow_early_ship", "false")) === "true";
    const inst1 = await one("select status from deal_installments where deal_id=$1 and seq=1", [deal.id]);
    if (!allowEarly || inst1?.status !== "confirmed") {
      throw new Error("Deal is partially funded. Early dispatch requires allow_early_ship setting enabled and first installment confirmed.");
    }
  } else {
    assertTransition(deal.status, "shipped", "seller");
  }

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
      `PakkaDeal #${deal.code}: Delivered! Please inspect item and confirm receipt in your dashboard within ${autoReleaseHours} hours before automatic fund release.`,
      `Parcel Delivered – ${autoReleaseHours}h Review Window`,
      deal.code
    );

    await notifySeller(
      deal.seller_id,
      `PakkaDeal #${deal.code}: Courier confirmed delivery to buyer. ${autoReleaseHours}-hour confirmation countdown is now active.`,
      "Delivery Confirmed",
      deal.code
    );

    return one("select * from deals where id=$1", [deal.id]);
  }

  if (status === "refused" || status === "returned") {
    if (deal.payment_mode === "delivery_only") {
      const refusalHours = Number(await getSetting("refusal_review_hours", 24));
      const refusalReviewUntil = new Date(Date.now() + refusalHours * 36e5).toISOString();

      return await transaction(async () => {
        const updated = await q(
          `update deals set
             status='refused',
             outcome='refused_at_door',
             courier_status='refused',
             confirm_by=$2,
             auto_release_at=$2,
             auto_release_paused=0,
             updated_at=CURRENT_TIMESTAMP
           where id=$1 and status in ('shipped', 'in_transit')
           returning *`,
          [deal.id, refusalReviewUntil]
        );

        if (updated.length !== 1) {
          return one("select * from deals where id=$1", [deal.id]);
        }

        await log(
          deal.id,
          "refused",
          `Buyer refused parcel at doorstep (delivery-only). ${refusalHours}-hour fair refusal review window started for buyer claim.`,
          {
            fromStatus: deal.status,
            toStatus: "refused",
            actor: "courier",
          }
        );

        await notify(
          deal.buyer_phone,
          `PakkaDeal #${deal.code}: Order refused at doorstep. If this was seller fault (wrong/damaged item), submit a claim with photo evidence within ${refusalHours} hours before shipping compensation is released.`,
          `Order Refused – ${refusalHours}h Review Window`,
          deal.code
        );

        await notifySeller(
          deal.seller_id,
          `PakkaDeal #${deal.code}: Order refused at doorstep. ${refusalHours}-hour review window started. Shipping compensation will be released if no seller fault claim is filed.`,
          "Order Refused – Review Active",
          deal.code
        );

        return updated[0];
      });
    }

    return await settleRefusalCompensation(deal, "courier");
  }

  return deal;
}

/** Settle refusal/return compensation to seller, platform fee, and remainder refund to buyer */
export async function settleRefusalCompensation(deal, actor = "system") {
  return await transaction(async () => {
    const updated = await q(
      `update deals set
         status='released',
         outcome='refused_at_door',
         courier_status='refused',
         auto_release_paused=1,
         updated_at=CURRENT_TIMESTAMP
       where id=$1 and status in ('shipped', 'in_transit', 'refused')
       returning *`,
      [deal.id]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

    const currentDeal = updated[0];
    const heldAmount = currentDeal.seller_payout !== undefined && currentDeal.seller_payout !== null && currentDeal.seller_payout > 0
      ? currentDeal.seller_payout
      : Math.max(0, currentDeal.total_amount - (currentDeal.fee_amount || 0));

    const deliveryCharge = currentDeal.delivery_charge || 0;
    const returnCharge = currentDeal.return_charge !== undefined && currentDeal.return_charge !== null
      ? currentDeal.return_charge
      : deliveryCharge;
    const deliveryAndReturn = deliveryCharge + returnCharge;

    const compensation = Math.min(heldAmount, deliveryAndReturn);
    const sellerPayout = compensation;
    const remainingAfterComp = Math.max(0, currentDeal.total_amount - sellerPayout);
    const platformFee = Math.min(currentDeal.fee_amount || 0, remainingAfterComp);
    const buyerRefund = Math.max(0, remainingAfterComp - platformFee);

    if (sellerPayout > 0) {
      await addLedger({
        dealId: currentDeal.id,
        type: "payout_seller",
        amount: sellerPayout,
        notes: `Delivery & return shipping compensation for refused order #${currentDeal.code}`,
      });
    }

    if (platformFee > 0) {
      await addLedger({
        dealId: currentDeal.id,
        type: "platform_fee",
        amount: platformFee,
        notes: `Platform service fee for #${currentDeal.code}`,
      });
    }

    if (buyerRefund > 0) {
      await addLedger({
        dealId: currentDeal.id,
        type: "refund_buyer",
        amount: buyerRefund,
        partyPhone: currentDeal.buyer_phone,
        notes: `Refund after delivery deductions for refused order #${currentDeal.code}`,
      });
    }

    const shortfall = Math.max(0, deliveryAndReturn - heldAmount);
    if (shortfall > 0) {
      await q(
        `insert into buyer_liabilities(deal_id, phone, amount, reason, status) values($1, $2, $3, $4, 'open')`,
        [currentDeal.id, currentDeal.buyer_phone, shortfall, `Refusal shipping shortfall for deal #${currentDeal.code} with reduced deposit`]
      );
      await log(
        currentDeal.id,
        "liability_recorded",
        `Shortfall of ${shortfall} BDT recorded as buyer liability due to doorstep refusal with reduced deposit.`,
        { actor: "system" }
      );
    }

    await bumpBuyer(currentDeal.buyer_phone, "refused");
    await log(
      currentDeal.id,
      "refused",
      `Order refused at doorstep. Shipping compensation (${sellerPayout} BDT) released to seller, platform fee (${platformFee} BDT) collected, remainder (${buyerRefund} BDT) refunded to buyer.`,
      {
        fromStatus: deal.status,
        toStatus: "released",
        actor: actor,
      }
    );

    await notify(
      currentDeal.buyer_phone,
      `PakkaDeal #${currentDeal.code}: Order refused at doorstep. Refund of ${buyerRefund} BDT processed after delivery charges.`,
      "Order Refused – Refund Processed",
      currentDeal.code
    );

    await notifySeller(
      currentDeal.seller_id,
      `PakkaDeal #${currentDeal.code}: Order refused at doorstep. Shipping charge compensation (${sellerPayout} BDT) released to your account.`,
      "Order Refused",
      currentDeal.code
    );

    return currentDeal;
  });
}

/** Buyer confirms receipt or auto-release timer completes */
export async function releaseToSeller(deal, outcome = "buyer_confirmed", actor = "buyer", proofOpts = {}) {
  assertTransition(deal.status, "released", actor);

  return await transaction(async () => {
    // Requirement: Seller bKash must be verified by admin before payout can be released
    const seller = await one("select * from users where id=$1", [deal.seller_id]);
    if (!seller || !seller.bkash_verified) {
      throw new Error("Seller bKash account is not verified by admin. Payout cannot be released until seller's bKash is verified.");
    }

    const amounts = computeAmounts({
      dealType: deal.deal_type,
      mode: deal.payment_mode,
      price: deal.price,
      charge: deal.delivery_charge,
      returnCharge: deal.return_charge,
      feePercent: deal.fee_percent,
    });
    const payout = deal.seller_payout !== undefined && deal.seller_payout !== null ? deal.seller_payout : amounts.seller_payout;
    const fee = deal.fee_amount !== undefined && deal.fee_amount !== null ? deal.fee_amount : amounts.fee_amount;

    const unboxingPhoto = proofOpts.unboxingPhoto || null;
    const unboxingPhotoType = proofOpts.unboxingPhotoType || "";

    const updated = await q(
      `update deals set
         status='released',
         outcome=$2,
         auto_release_paused=1,
         payout_status='pending',
         unboxing_photo=coalesce($3, unboxing_photo),
         unboxing_photo_type=case when $3 is not null then $4 else unboxing_photo_type end,
         updated_at=CURRENT_TIMESTAMP
       where id=$1 and status in ('delivered', 'disputed')
       returning *`,
      [deal.id, outcome, unboxingPhoto, unboxingPhotoType]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

    let effectivePayout = payout;
    try {
      const openSellerLiabs = await q(
        "select * from seller_liabilities where seller_id=$1 and status='open' order by id asc",
        [deal.seller_id]
      );
      for (const liab of openSellerLiabs || []) {
        if (effectivePayout <= 0) break;
        const netAmount = Math.min(effectivePayout, liab.amount);
        effectivePayout -= netAmount;
        if (netAmount === liab.amount) {
          await q("update seller_liabilities set status='settled', netted_payout_id=$1 where id=$2", [deal.id, liab.id]);
        } else {
          await q("update seller_liabilities set amount=$1 where id=$2", [liab.amount - netAmount, liab.id]);
        }
        await addLedger({
          dealId: deal.id,
          type: "liability_netted",
          amount: netAmount,
          notes: `Netted ${netAmount} BDT seller liability (#${liab.id}) from deal #${deal.code} payout`,
        });
        await log(
          deal.id,
          "liability_netted",
          `Deducted ${netAmount} BDT from payout to settle previous liability from deal #${liab.deal_id || "N/A"}.`,
          { actor: "system" }
        );
      }
    } catch (_liabErr) {}

    if (effectivePayout > 0) {
      await addLedger({
        dealId: deal.id,
        type: "payout_seller",
        amount: effectivePayout,
        notes: `Seller payout for deal #${deal.code}${effectivePayout < payout ? ` (netted from ${payout} BDT)` : ""}`,
      });
    }

    await addLedger({
      dealId: deal.id,
      type: "platform_fee",
      amount: fee,
      notes: `Platform service fee for deal #${deal.code}`,
    });

    await bumpBuyer(deal.buyer_phone, "delivered");
    await bumpSeller(deal.seller_id, "completed");

    const autoReleaseHours = Number(await getSetting("confirm_window_hours", config.confirmWithinHours || 72));
    const noteMsg = outcome === "auto_release_timeout"
      ? `${autoReleaseHours}-hour confirmation window expired. Escrow funds auto-released to seller.`
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

    return updated[0];
  });
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

  return await transaction(async () => {
    const updated = await q(
      `update deals set
         status='refunded',
         outcome='return_received',
         auto_release_paused=1,
         updated_at=CURRENT_TIMESTAMP
       where id=$1 and status in ('return_requested', 'return_shipped', 'return_received')
       returning *`,
      [deal.id]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

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

    return updated[0];
  });
}

/** Rental / Service dual confirmation */
export async function applyHandoverConfirmation(deal, user) {
  const isSeller = Number(user.id) === Number(deal.seller_id);
  const isBuyer = Number(user.id) === Number(deal.buyer_id);
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
  return await transaction(async () => {
    const seller = await one("select * from users where id=$1", [deal.seller_id]);
    if (!seller || !seller.bkash_verified) {
      throw new Error("Seller bKash account is not verified by admin. Payout cannot be released until seller's bKash is verified.");
    }

    const amounts = computeAmounts({
      dealType: deal.deal_type,
      mode: deal.payment_mode,
      price: deal.price,
      charge: deal.delivery_charge,
      returnCharge: deal.return_charge,
      feePercent: deal.fee_percent,
    });
    const payout = deal.seller_payout !== undefined && deal.seller_payout !== null ? deal.seller_payout : amounts.seller_payout;
    const fee = deal.fee_amount !== undefined && deal.fee_amount !== null ? deal.fee_amount : amounts.fee_amount;

    const updated = await q(
      `update deals set status='released', outcome='admin_forced_release', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP
       where id=$1 and status not in ('released', 'refunded', 'cancelled')
       returning *`,
      [deal.id]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

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

    return updated[0];
  });
}

/** Admin Force Refund */
export async function adminForceRefund(deal, adminNotes = "", actor = "admin") {
  return await transaction(async () => {
    const refundAmount = deal.total_amount;

    const updated = await q(
      `update deals set status='refunded', outcome='admin_forced_refund', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP
       where id=$1 and status not in ('released', 'refunded', 'cancelled')
       returning *`,
      [deal.id]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

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

    return updated[0];
  });
}

/** Admin Split Resolution */
export async function adminSplitResolution(deal, sellerAmount, buyerAmount, adminNotes = "", actor = "admin") {
  if (sellerAmount + buyerAmount > deal.total_amount) {
    throw new Error(`Total split amount (${sellerAmount + buyerAmount}) cannot exceed deal total amount (${deal.total_amount})`);
  }

  return await transaction(async () => {
    const updated = await q(
      `update deals set status='released', outcome='admin_split_resolution', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP
       where id=$1 and status not in ('released', 'refunded', 'cancelled')
       returning *`,
      [deal.id]
    );

    if (updated.length !== 1) {
      return one("select * from deals where id=$1", [deal.id]);
    }

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

    return updated[0];
  });
}

let isCheckingTimeouts = false;

/** Check automated timeouts: seller ship timeout or 24h buyer confirmation timeout */
export async function checkAllTimeouts() {
  if (isCheckingTimeouts) return;
  isCheckingTimeouts = true;
  try {
    const now = new Date().toISOString();

    // 1. Unshipped deals past ship_by -> auto full refund to buyer
    const lateDeals = await q(
      "select * from deals where status='held' and ship_by is not null and ship_by < $1",
      [now]
    );
    for (const deal of lateDeals) {
      await transaction(async () => {
        const updated = await q(
          `update deals set status='refunded', outcome='seller_ship_timeout', updated_at=CURRENT_TIMESTAMP
           where id=$1 and status='held'
           returning *`,
          [deal.id]
        );
        if (updated.length !== 1) return;

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
      });
    }

    // 2. Delivered deals past auto_release_at where countdown is not paused -> auto release to seller
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
      console.log(`[AUTO-RELEASE TIMER] Confirmation window elapsed for deal #${deal.code}. Auto-releasing funds to seller.`);
      await releaseToSeller(deal, "auto_release_timeout", "system");
    }

    // 3. Refused delivery_only deals past refusal review window (refusal_review_hours)
    const expiredRefusedDeals = await q(
      `select * from deals
       where status='refused'
         and payment_mode='delivery_only'
         and auto_release_paused = 0
         and (
           (auto_release_at is not null and auto_release_at < $1)
           or (confirm_by is not null and confirm_by < $1)
         )`,
      [now]
    );
    for (const deal of expiredRefusedDeals) {
      const openDispute = await one(
        "select * from disputes where deal_id=$1 and status='open'",
        [deal.id]
      );
      if (openDispute) {
        // Claim exists: freeze funds and send to admin
        await transaction(async () => {
          const updated = await q(
            `update deals set status='disputed', outcome='disputed', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP
             where id=$1 and status='refused'
             returning *`,
            [deal.id]
          );
          if (updated.length === 1) {
            await log(deal.id, "disputed", "Buyer filed seller-fault claim during refusal review. Funds frozen for admin review.", {
              fromStatus: "refused",
              toStatus: "disputed",
              actor: "system",
            });
            await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Refusal claim recorded. Funds are frozen pending admin decision.`);
            await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Buyer disputed refusal. Funds are held for admin investigation.`);
          }
        });
      } else {
        // No claim filed: window ended, pay seller compensation (cron only)
        console.log(`[REFUSAL-REVIEW TIMER] Refusal review window expired for deal #${deal.code}. Settling seller compensation.`);
        await settleRefusalCompensation(deal, "system");
      }
    }

    // 4. Challenge 1B: Expired installments check
    try {
      const expiredInsts = await q(
        `select i.*, d.code, d.status as deal_status, d.buyer_phone, d.seller_id
         from deal_installments i
         join deals d on d.id = i.deal_id
         where i.status in ('pending', 'submitted')
           and i.due_at < $1`,
        [now]
      );
      for (const inst of expiredInsts || []) {
        await transaction(async () => {
          await q("update deal_installments set status='expired' where id=$1", [inst.id]);

          if (["created", "payment_pending", "partially_funded", "held"].includes(inst.deal_status)) {
            // Before shipping: cancel deal and refund confirmed installments
            const sumRow = await one(
              "select coalesce(sum(amount), 0) as s from deal_installments where deal_id=$1 and status='confirmed'",
              [inst.deal_id]
            );
            const confirmedSum = Number(sumRow?.s || 0);

            await q(
              `update deals set status='cancelled', outcome='installment_expired', updated_at=CURRENT_TIMESTAMP
               where id=$1 and status in ('created', 'payment_pending', 'partially_funded', 'held')`,
              [inst.deal_id]
            );

            if (confirmedSum > 0) {
              await addLedger({
                dealId: inst.deal_id,
                type: "refund_buyer",
                amount: confirmedSum,
                partyPhone: inst.buyer_phone,
                notes: `Refund for cancelled deal #${inst.code} after installment #${inst.seq} expired before shipping`,
              });
            }
            await log(
              inst.deal_id,
              "cancelled",
              `Installment #${inst.seq} expired before shipping. Deal cancelled and ${confirmedSum} BDT confirmed funds refunded to buyer.`,
              { actor: "system" }
            );
            await notify(
              inst.buyer_phone,
              `PakkaDeal #${inst.code}: Deal cancelled because installment #${inst.seq} expired before shipping. Refund of ${confirmedSum} BDT processed.`,
              "Installment Expired – Deal Cancelled",
              inst.code
            );
            await notifySeller(
              inst.seller_id,
              `PakkaDeal #${inst.code}: Deal cancelled because buyer missed installment deadline before shipping.`,
              "Deal Cancelled",
              inst.code
            );
          } else if (["shipped", "in_transit", "delivered", "refused"].includes(inst.deal_status)) {
            // After shipping: create buyer liability and penalize trust
            await q(
              `insert into buyer_liabilities(deal_id, phone, amount, reason, status)
               values($1, $2, $3, $4, 'open')`,
              [
                inst.deal_id,
                inst.buyer_phone,
                inst.amount,
                `Unpaid installment #${inst.seq} after parcel shipped for deal #${inst.code}`,
              ]
            );
            await bumpBuyer(inst.buyer_phone, "refused");
            await log(
              inst.deal_id,
              "liability_recorded",
              `Installment #${inst.seq} (${inst.amount} BDT) expired after shipping. Recorded as buyer liability.`,
              { actor: "system" }
            );
            await notify(
              inst.buyer_phone,
              `PakkaDeal #${inst.code}: Installment #${inst.seq} (${inst.amount} BDT) expired after shipping. Saved as an outstanding liability on your account.`,
              "Outstanding Liability Recorded",
              inst.code
            );
          }
        });
      }
    } catch (_instErr) {
      console.warn("Installment timeout check warning:", _instErr.message);
    }
  } finally {
    isCheckingTimeouts = false;
  }
}
