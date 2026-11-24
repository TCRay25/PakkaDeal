import { Router } from "express";
import { randomBytes } from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { one, q, transaction } from "../db.js";
import { adminOnly, auth, fail, isAdmin, optionalAuth } from "../http.js";
import { PHONE } from "./auth.js";
import { getBuyer, successRatio } from "../services/trust.js";
import { scoreOrder } from "../services/risk.js";
import { log, notify, notifySeller } from "../services/events.js";
import { computeAmounts } from "../services/amounts.js";
import {
  applyPayment,
  applyShip,
  applyCourier,
  releaseToSeller,
  applyHandoverConfirmation,
  requestReturn,
  shipReturn,
  completeReturn,
  calculateFee,
  getSetting,
} from "../services/settle.js";
import {
  detectCourier,
  updateDealTracking,
  getDealTrackingTimeline,
} from "../services/tracking.service.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File must be an image under 5 MB (JPEG, PNG, WEBP)"));
    }
  },
});

export async function loadDeal(codeOrId) {
  try {
    let deal = await one(
      "select * from deals where code=$1 or id=$2",
      [String(codeOrId), Number(codeOrId) || 0]
    );
    if (!deal) fail(404, "Deal not found");
    if (!deal.buyer_id && deal.buyer_phone) {
      const buyer = await one("select id from users where phone=$1", [deal.buyer_phone]);
      if (buyer?.id) {
        await q("update deals set buyer_id=$1 where id=$2", [buyer.id, deal.id]);
        deal.buyer_id = buyer.id;
      }
    }
    return deal;
  } catch (err) {
    if (err.message && err.message.includes('column "updated_at" of relation "deals" does not exist')) {
      try {
        await q("alter table deals add column if not exists updated_at timestamptz not null default now()");
        await q("alter table deals add column if not exists created_at timestamptz not null default now()");
        await q("alter table deals add column if not exists buyer_id int");
        let deal = await one(
          "select * from deals where code=$1 or id=$2",
          [String(codeOrId), Number(codeOrId) || 0]
        );
        if (!deal) fail(404, "Deal not found");
        if (!deal.buyer_id && deal.buyer_phone) {
          const buyer = await one("select id from users where phone=$1", [deal.buyer_phone]);
          if (buyer?.id) {
            await q("update deals set buyer_id=$1 where id=$2", [buyer.id, deal.id]);
            deal.buyer_id = buyer.id;
          }
        }
        return deal;
      } catch (innerErr) {
        throw err;
      }
    }
    throw err;
  }
}

function toBase32(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

const mask = (p) => (p && p.length >= 7 ? p.slice(0, 3) + "****" + p.slice(-3) : p);

async function view(deal, user) {
  const isSeller = !!user && Number(user.id) === Number(deal.seller_id);
  const isBuyer = !!user && Number(user.id) === Number(deal.buyer_id);
  const isAdminUser = !!user && isAdmin(user);
  const isParticipant = isSeller || isBuyer || isAdminUser;

  const seller = await one(
    "select id, public_id, name, phone, page_name, page_url, seller_trust from users where id=$1",
    [deal.seller_id]
  );
  const buyer = await getBuyer(deal.buyer_phone);
  const events = await q(
    "select id, kind, from_status, to_status, actor, note, created_at from deal_events where deal_id=$1 order by id asc",
    [deal.id]
  );
  const ledgerEntries = await q(
    "select id, transaction_type, amount, party_phone, notes, created_at from ledger where deal_id=$1 order by id asc",
    [deal.id]
  );
  const dispute = await one(
    "select id, reason, category, evidence_text, ai_summary, ai_recommendation, status, created_at from disputes where deal_id=$1 order by id desc",
    [deal.id]
  );
  const tracking = deal.tracking_id ? await getDealTrackingTimeline(deal.id) : null;

  const escrowAccounts = {
    bkash: await getSetting("escrow_bkash_merchant", "01711-000000"),
    nagad: await getSetting("escrow_nagad_merchant", "01911-000000"),
    rocket: await getSetting("escrow_rocket_merchant", "01811-000000"),
    bankName: await getSetting("escrow_bank_name", "City Bank Ltd (Gulshan Branch)"),
    bankAccount: await getSetting("escrow_bank_account", "PakkaDeal Escrow Services Ltd (A/C: 150239482001)"),
    instructions: await getSetting(
      "escrow_payment_instructions",
      "বিকাশ বা নগদ অ্যাপের 'Make Payment' অপশন থেকে পাক্কাডিল অফিসিয়াল এসক্রো মার্চেন্ট নাম্বারে সম্পূর্ণ টাকা পেমেন্ট করুন। এরপর প্রাপ্ত Transaction ID (TrxID) এবং আপনার প্রেরক নম্বর নিচে বসিয়ে কনফার্ম করুন। টাকা সরাসরি পাক্কা ডিল এসক্রো ভল্টে সুরক্ষিত থাকবে।"
    ),
  };

  // Strip large raw buffers from JSON response
  const { buyer_phone, consignment_slip, unboxing_photo, ...rest } = deal;

  const feePercent = Number(await getSetting("platform_fee_percent", 1));
  const feeMin = Number(await getSetting("platform_fee_min", 10));
  const minDeposit = Number(await getSetting("min_delivery_deposit", 60));

  const amounts = computeAmounts({
    dealType: deal.deal_type,
    mode: deal.payment_mode,
    price: deal.price,
    charge: deal.delivery_charge,
    returnCharge: deal.return_charge,
    feePercent: deal.fee_percent || feePercent,
    feeMin,
    minDeposit,
  });

  const dealView = {
    ...rest,
    payment_mode: deal.payment_mode || (deal.deal_type === "product" ? "delivery_only" : "full_payment"),
    held_amount: amounts.held_amount,
    cod_amount: deal.cod_amount !== undefined && deal.cod_amount !== null ? deal.cod_amount : amounts.cod_amount,
    total_amount: deal.total_amount || amounts.total_amount,
    fee_amount: deal.fee_amount !== undefined && deal.fee_amount !== null ? deal.fee_amount : amounts.fee_amount,
    seller_payout: deal.seller_payout !== undefined && deal.seller_payout !== null ? deal.seller_payout : amounts.seller_payout,
    has_consignment_slip: !!consignment_slip,
    has_unboxing_photo: !!unboxing_photo,
    buyer_phone: isParticipant ? buyer_phone : mask(buyer_phone),
  };

  // If the viewer is the seller, they do NOT see the buyer's escrow service fee
  if (isSeller && !isAdminUser) {
    dealView.fee_amount = 0;
    dealView.fee_percent = 0;
  }

  const sellerView = {
    id: seller ? (seller.public_id || seller.id) : null,
    public_id: seller ? (seller.public_id || String(seller.id)) : null,
    name: seller?.name || "",
    page_name: seller?.page_name || "",
    page_url: seller?.page_url || "",
    seller_trust: seller?.seller_trust ?? 70,
    ...(isParticipant && seller?.phone ? { phone: seller.phone } : {}),
  };

  return {
    deal: dealView,
    seller: sellerView,
    buyer: {
      phone: isParticipant ? deal.buyer_phone : mask(deal.buyer_phone),
      name: deal.buyer_name,
      trust_score: buyer.trust_score,
      delivered: buyer.delivered,
      refused: buyer.refused,
    },
    events,
    ledger: isParticipant ? ledgerEntries : [],
    dispute: dispute || null,
    tracking: tracking || null,
    me: {
      is_seller: isSeller,
      is_buyer: isBuyer,
      is_admin: isAdminUser,
    },
    escrow_accounts: escrowAccounts,
  };
}

router.get("/", auth, async (req, res) => {
  const { status, type, role, q: search } = req.query;

  const userPhone11 = (req.user.phone || "").replace(/\D/g, "").slice(-11);

  let query = `
    select d.*, u.page_name, u.name as seller_name, u.phone as seller_phone
    from deals d
    join users u on u.id = d.seller_id
    where (
      d.seller_id = $1 or
      d.buyer_id = $1 or
      d.buyer_phone = $2 or
      replace(replace(d.buyer_phone, '+88', ''), ' ', '') = $3 or
      d.payment_sender = $2 or
      replace(replace(d.payment_sender, '+88', ''), ' ', '') = $3
    )
  `;
  const params = [req.user.id, req.user.phone, userPhone11];

  if (status) {
    params.push(status);
    query += ` and d.status = $${params.length}`;
  }
  if (type) {
    params.push(type);
    query += ` and d.deal_type = $${params.length}`;
  }
  if (role === "seller") {
    query += ` and d.seller_id = $1`;
  } else if (role === "buyer") {
    query += ` and (d.seller_id != $1 or d.buyer_id = $1 or d.buyer_phone = $2 or replace(replace(d.buyer_phone, '+88', ''), ' ', '') = $3)`;
  }
  if (search) {
    params.push(`%${search}%`);
    query += ` and (d.product like $${params.length} or d.code like $${params.length} or d.buyer_name like $${params.length})`;
  }

  query += ` order by d.id desc`;
  const rows = await q(query, params);

  // Strip blobs
  const cleanRows = rows.map(({ consignment_slip, unboxing_photo, ...d }) => {
    const isSeller = Number(d.seller_id) === Number(req.user.id);
    return {
      ...d,
      is_seller: isSeller,
      role: isSeller ? "seller" : "buyer",
      has_consignment_slip: !!consignment_slip,
      has_unboxing_photo: !!unboxing_photo,
    };
  });

  res.json(cleanRows);
});

router.post("/", auth, async (req, res) => {
  if (!req.user.bkash_number) {
    fail(400, "Please complete your profile by adding your bKash account number and type before creating deals.");
  }

  const b = req.body;
  const dealType = ["product", "rental", "service"].includes(b.deal_type) ? b.deal_type : "product";
  const price = Math.round(Number(b.price));
  const charge = dealType === "product" ? Math.round(Number(b.delivery_charge || 0)) : 0;
  const returnCharge = dealType === "product" ? Math.round(Number(b.return_charge || charge)) : 0;
  const returnPolicy = ["buyer_pays", "seller_pays", "no_returns"].includes(b.return_policy) ? b.return_policy : "buyer_pays";

  if (!PHONE.test(b.buyer_phone || "")) fail(400, "Enter a valid 11-digit Bangladesh buyer mobile number");
  if (!b.buyer_name?.trim()) fail(400, "Enter buyer name");
  if (!b.product?.trim()) fail(400, "Enter item or service title");
  if ((b.address || "").trim().length < 5) fail(400, "Enter complete delivery or handover address");
  if (!(price > 0)) fail(400, "Amount must be greater than 0");
  if (b.buyer_phone === req.user.phone) fail(400, "You cannot create a deal with your own phone number");

  const paymentMode = b.payment_mode || "delivery_only";
  if (dealType !== "product" && b.payment_mode === "delivery_only") {
    fail(400, "Delivery-only payment mode is only available for product deals");
  }
  const effectiveMode = dealType === "product"
    ? (paymentMode === "full_payment" ? "full_payment" : "delivery_only")
    : "full_payment";

  const feePercent = Number(await getSetting("platform_fee_percent", 1));
  const feeMin = Number(await getSetting("platform_fee_min", 10));
  const minDeposit = Number(await getSetting("min_delivery_deposit", 60));

  const amounts = computeAmounts({
    dealType,
    mode: effectiveMode,
    price,
    charge,
    returnCharge,
    feePercent,
    feeMin,
    minDeposit,
  });

  const buyer = await getBuyer(b.buyer_phone);
  const hourBd = (new Date().getUTCHours() + 6) % 24;
  const { score: riskScore, reasons } = scoreOrder({
    price,
    charge,
    address: b.address,
    successRatio: successRatio(buyer),
    hourBd,
    newBuyer: (buyer.delivered || 0) + (buyer.refused || 0) === 0,
  });

  const code = toBase32(randomBytes(9));

  const existingBuyer = await one("select id from users where phone = $1", [b.buyer_phone.trim()]);
  const buyerId = existingBuyer?.id || null;

  const deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name, address, area, product, details,
       price, delivery_charge, total_amount, fee_amount, fee_percent, seller_payout, deposit,
       return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
     ) values(
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
     ) returning *`,
    [
      code,
      dealType,
      effectiveMode,
      amounts.cod_amount,
      req.user.id,
      buyerId,
      b.buyer_phone.trim(),
      b.buyer_name.trim(),
      b.address.trim(),
      b.area || "Dhaka",
      b.product.trim(),
      (b.details || "").trim(),
      price,
      charge,
      amounts.total_amount,
      amounts.fee_amount,
      feePercent,
      amounts.seller_payout,
      amounts.total_amount,
      returnPolicy,
      returnCharge,
      "created",
      b.courier_name || "Steadfast",
      riskScore,
      reasons.join(", ") || "Standard verified parameters",
      buyer.trust_score,
    ]
  );

  await log(deal.id, "created", `Deal created by ${req.user.page_name || req.user.name || "seller"}`, {
    fromStatus: "",
    toStatus: "created",
    actor: "seller",
  });

  await notify(
    deal.buyer_phone,
    `PakkaDeal: ${req.user.page_name || req.user.name} invited you to deal #${deal.code} for "${deal.product}". Total: ${deal.total_amount} BDT (including ${feePercent}% escrow fee). Pay into escrow to proceed.`,
    "New Deal Invitation",
    deal.code
  );

  res.status(201).json(deal);
});

router.get("/:code", optionalAuth, async (req, res) => {
  const deal = await loadDeal(req.params.code);

  if (!req.user) {
    const seller = await one(
      "select id, public_id, name, page_name, seller_trust from users where id=$1",
      [deal.seller_id]
    );
    return res.json({
      invite: true,
      requires_auth: true,
      deal: {
        code: deal.code,
        deal_type: deal.deal_type,
        payment_mode: deal.payment_mode,
        cod_amount: deal.cod_amount,
        product: deal.product,
        total_amount: deal.total_amount,
        status: deal.status,
        created_at: deal.created_at,
      },
      seller: {
        id: seller ? (seller.public_id || seller.id) : null,
        public_id: seller ? (seller.public_id || String(seller.id)) : null,
        name: seller?.name || "",
        page_name: seller?.page_name || "",
        seller_trust: seller?.seller_trust ?? 70,
      },
      message: "Please sign in to view full deal details",
    });
  }

  res.json(await view(deal, req.user));
});

router.post(["/:code/open", "/:code/payment-pending"], auth, async (req, res) => {
  let deal = await loadDeal(req.params.code);
  const isBuyerUser = Number(req.user.id) === Number(deal.buyer_id);
  const isAdminUser = isAdmin(req.user);

  if (!isBuyerUser && !isAdminUser) {
    fail(403, "Only the designated buyer can open or acknowledge this deal");
  }

  if (deal.status === "created") {
    await q("update deals set status='payment_pending', updated_at=CURRENT_TIMESTAMP where id=$1 and status='created'", [deal.id]);
    await log(deal.id, "payment_pending", "Buyer opened deal link. Awaiting escrow payment.", {
      fromStatus: "created",
      toStatus: "payment_pending",
      actor: "buyer",
    });
    deal = await loadDeal(req.params.code);
  }

  res.json(await view(deal, req.user));
});

router.post("/:code/payment-mode", auth, async (req, res) => {
  let deal = await loadDeal(req.params.code);

  if (!deal.buyer_id && req.user.phone === deal.buyer_phone) {
    deal.buyer_id = req.user.id;
    await q("update deals set buyer_id=$1 where id=$2", [req.user.id, deal.id]);
  }

  const isBuyerUser = Number(req.user.id) === Number(deal.buyer_id);
  const isAdminUser = isAdmin(req.user);

  if (!isBuyerUser && !isAdminUser) {
    fail(403, "Only the buyer of this deal can change the payment mode");
  }

  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "Payment mode can only be changed while deal is created or payment_pending");
  }

  if (deal.deal_type !== "product") {
    fail(400, "Payment mode can only be changed for physical product deals");
  }

  const newMode = (req.body.payment_mode || "").trim();
  if (!["delivery_only", "full_payment"].includes(newMode)) {
    fail(400, "Invalid payment mode. Must be 'delivery_only' or 'full_payment'");
  }

  const feePercent = Number(await getSetting("platform_fee_percent", 1));
  const feeMin = Number(await getSetting("platform_fee_min", 10));
  const minDeposit = Number(await getSetting("min_delivery_deposit", 60));

  const amounts = computeAmounts({
    dealType: deal.deal_type,
    mode: newMode,
    price: deal.price,
    charge: deal.delivery_charge,
    returnCharge: deal.return_charge,
    feePercent: deal.fee_percent || feePercent,
    feeMin,
    minDeposit,
  });

  const updatedDeal = await transaction(async () => {
    const updated = await q(
      `update deals set
         payment_mode=$2,
         cod_amount=$3,
         total_amount=$4,
         fee_amount=$5,
         seller_payout=$6,
         deposit=$4,
         updated_at=CURRENT_TIMESTAMP
       where id=$1 and status in ('created', 'payment_pending')
       returning *`,
      [deal.id, newMode, amounts.cod_amount, amounts.total_amount, amounts.fee_amount, amounts.seller_payout]
    );

    if (updated.length !== 1) {
      fail(400, "Failed to update payment mode (deal may have already progressed)");
    }

    await log(
      deal.id,
      "payment_mode_changed",
      `Buyer switched payment mode to '${newMode}'. Escrow deposit: ${amounts.total_amount} BDT, COD at delivery: ${amounts.cod_amount} BDT.`,
      { actor: "buyer" }
    );

    return updated[0];
  });

  res.json(await view(updatedDeal, req.user));
});

router.post("/:code/pay", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "Deal cannot be paid in status: " + deal.status);
  }

  // Caller must be the deal's buyer by user.id
  if (Number(req.user.id) !== Number(deal.buyer_id)) {
    fail(403, "Only the buyer can pay for this deal");
  }

  const paymentMethod = (req.body.payment_method || "bKash").trim();
  const senderNumber = (req.body.sender_number || req.user.phone || "").trim();
  const trxId = (req.body.trx_id || req.body.trxId || "").trim();

  if (!trxId) {
    fail(400, "Transaction ID (TrxID) is required");
  }

  const amountPaid = Math.round(Number(req.body.amount || deal.total_amount));
  const cleanTrxId = trxId.toUpperCase();

  if (!senderNumber || !PHONE.test(senderNumber)) {
    fail(400, "Please provide a valid 11-digit sender phone number");
  }

  // Security: Prevent duplicate TrxID across deals
  const duplicate = await one(
    "select id, code from deals where payment_trx_id = $1 and id != $2 and payment_status != 'rejected'",
    [cleanTrxId, deal.id]
  );
  if (duplicate) {
    fail(400, `এই TrxID (${cleanTrxId}) ইতিমধ্যে #${duplicate.code} নম্বর ডিলে ব্যবহার করা হয়েছে। অন্য TrxID দিন।`);
  }

  // Escrow flow: submits to Pending Payments for admin verification
  // A deal can ONLY become 'held' via admin payment confirmation!
  await q(
    `update deals set
       status = 'payment_pending',
       payment_status = 'pending',
       payment_method = $2,
       payment_sender = $3,
       payment_trx_id = $4,
       payment_amount = $5,
       payment_submitted_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     where id = $1`,
    [deal.id, paymentMethod, senderNumber, cleanTrxId, amountPaid]
  );

  await log(
    deal.id,
    "payment_submitted",
    `Buyer submitted payment via ${paymentMethod} (${amountPaid} BDT, TrxID: ${cleanTrxId}, Sender: ${senderNumber}). Awaiting admin verification.`,
    {
      fromStatus: deal.status,
      toStatus: "payment_pending",
      actor: "buyer",
    }
  );

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: আপনার পেমেন্ট সাবমিশন গৃহীত হয়েছে (TrxID: ${cleanTrxId}, ${amountPaid.toLocaleString()} BDT)। অ্যাডমিন ভেরিফিকেশন সম্পন্ন হলে ফান্ড এসক্রোতে লক হবে।`,
    "Payment Submitted",
    deal.code
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: ক্রেতা পেমেন্ট সাবমিট করেছেন (TrxID: ${cleanTrxId})। অ্যাডমিন ভেরিফিকেশন সম্পন্ন হওয়া মাত্র পার্সেল পাঠানোর নির্দেশনা পাবেন।`,
    "Payment Submitted by Buyer",
    deal.code
  );

  const updated = await one("select * from deals where id=$1", [deal.id]);
  const viewData = await view(updated, req.user);

  // Must never return a token
  res.json(viewData);
});

/** Delete unpaid deal (Seller or Admin only, before payment is deposited) */
router.delete("/:code", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isAdminUser = config.adminPhones.includes(req.user.phone);
  if (deal.seller_id !== req.user.id && !isAdminUser) {
    fail(403, "Only the creator of this deal can delete it");
  }

  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "টাকা এসক্রোতে জমা হওয়ার পর ডিল ডিলিট করা যাবে না। (Cannot delete deal after escrow payment is made)");
  }

  // Cascade delete child records
  await q("delete from tracking_events where deal_id = $1", [deal.id]);
  await q("delete from deal_events where deal_id = $1", [deal.id]);
  await q("delete from ledger where deal_id = $1", [deal.id]);
  await q("delete from disputes where deal_id = $1", [deal.id]);
  await q("delete from notifications where deal_code = $1", [deal.code]);
  await q("delete from deals where id = $1", [deal.id]);

  res.json({ ok: true, message: `Deal #${deal.code} deleted successfully` });
});

router.post("/:code/delete", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isAdminUser = config.adminPhones.includes(req.user.phone);
  if (deal.seller_id !== req.user.id && !isAdminUser) {
    fail(403, "Only the creator of this deal can delete it");
  }

  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "টাকা এসক্রোতে জমা হওয়ার পর ডিল ডিলিট করা যাবে না। (Cannot delete deal after escrow payment is made)");
  }

  await q("delete from tracking_events where deal_id = $1", [deal.id]);
  await q("delete from deal_events where deal_id = $1", [deal.id]);
  await q("delete from ledger where deal_id = $1", [deal.id]);
  await q("delete from disputes where deal_id = $1", [deal.id]);
  await q("delete from notifications where deal_code = $1", [deal.code]);
  await q("delete from deals where id = $1", [deal.id]);

  res.json({ ok: true, message: `Deal #${deal.code} deleted successfully` });
});

router.post("/:code/ship", auth, upload.single("consignment_slip"), async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.seller_id !== req.user.id) fail(403, "Not your deal");
  if (deal.status !== "held") fail(400, "Deal is not in held status");

  let trackingId = (req.body.tracking_id || req.body.trackingId || "").trim();
  let courierName = (req.body.courier_name || req.body.courier || "").trim();
  let detectionConfidence = 0;
  let trackingSource = "api";

  // If courier name wasn't explicitly provided, run the detection engine on trackingId
  if (!courierName && trackingId) {
    const detection = detectCourier(trackingId);
    if (detection?.detectedCourier) {
      courierName = detection.detectedCourier;
      detectionConfidence = detection.detectionConfidence;
    }
  }

  if (!courierName) {
    courierName = deal.courier_name || "Steadfast";
  }

  const courierPhone = (req.body.courier_phone || "").trim();
  const lowerName = courierName.toLowerCase();
  const isManualCourier =
    lowerName === "other" ||
    lowerName === "sundarban" ||
    lowerName === "sa paribahan" ||
    req.body.is_manual_courier === "1" ||
    req.body.is_manual_courier === true;

  if (isManualCourier) {
    trackingSource = "manual";
    if (!courierPhone) fail(400, "Please provide courier contact phone number for manual tracking");
    if (!req.file) fail(400, "Please upload consignment slip photo for manual courier audit");
  } else {
    if (trackingId.length < 3) fail(400, "Enter a valid courier tracking ID");
  }

  const consignmentSlip = req.file?.buffer || null;
  const consignmentSlipType = req.file?.mimetype || "";

  const updated = await applyShip(deal, {
    courierName,
    trackingId: trackingId || `MANUAL-${Date.now().toString(36).toUpperCase()}`,
    isManualCourier,
    courierPhone,
    consignmentSlip,
    consignmentSlipType,
  });

  // Store detection confidence and tracking source
  await q(
    `update deals set detection_confidence=$2, tracking_source=$3 where id=$1`,
    [updated.id, detectionConfidence, trackingSource]
  );

  // Initialize/sync normalized tracking timeline
  await updateDealTracking(updated, trackingSource);

  const refreshed = await loadDeal(req.params.code);
  res.json(await view(refreshed, req.user));
});

router.get("/:code/tracking", optionalAuth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const tracking = await getDealTrackingTimeline(deal.id);
  if (!tracking) fail(404, "Tracking timeline not available for this deal");
  res.json(tracking);
});

router.post("/:code/confirm", auth, upload.single("unboxing_photo"), async (req, res) => {
  const deal = await loadDeal(req.params.code);

  const unboxingPhoto = req.file?.buffer || null;
  const unboxingPhotoType = req.file?.mimetype || "";

  if (deal.deal_type === "product") {
    if (Number(req.user.id) !== Number(deal.buyer_id)) fail(403, "Only the buyer can confirm product receipt");
    if (deal.status !== "delivered") fail(400, "Product must be marked delivered before confirmation");

    const updated = await releaseToSeller(deal, "buyer_confirmed", "buyer", {
      unboxingPhoto,
      unboxingPhotoType,
    });
    res.json(await view(updated, req.user));
  } else {
    // Rental or service handover
    const updated = await applyHandoverConfirmation(deal, req.user);
    res.json(await view(updated, req.user));
  }
});

router.post("/:code/request-return", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (Number(req.user.id) !== Number(deal.buyer_id)) fail(403, "Only the buyer can request a return");
  if (deal.status !== "delivered") fail(400, "Returns can only be requested after delivery");
  if (deal.return_policy === "no_returns") fail(400, "This deal has a no-return policy");

  const reason = (req.body.reason || "Buyer requested return").trim();
  const updated = await requestReturn(deal, reason, "buyer");
  res.json(await view(updated, req.user));
});

router.post("/:code/ship-return", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (Number(req.user.id) !== Number(deal.buyer_id)) fail(403, "Only the buyer can ship return");
  if (deal.status !== "return_requested") fail(400, "Return has not been requested for this deal");

  const trackingId = (req.body.return_tracking_id || "").trim();
  const courierName = (req.body.return_courier_name || "Pathao").trim();
  if (trackingId.length < 3) fail(400, "Enter return tracking ID");

  const updated = await shipReturn(deal, courierName, trackingId, "buyer");
  res.json(await view(updated, req.user));
});

router.post("/:code/confirm-return", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.seller_id !== req.user.id) fail(403, "Only the seller can confirm return receipt");
  if (!["return_requested", "return_shipped"].includes(deal.status)) {
    fail(400, "Return is not in transit or requested");
  }

  const updated = await completeReturn(deal, "seller");
  res.json(await view(updated, req.user));
});

router.get("/:code/consignment-slip", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isSeller = Number(req.user.id) === Number(deal.seller_id);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id);
  const isAdminUser = isAdmin(req.user);

  if (!isSeller && !isBuyer && !isAdminUser) {
    fail(403, "Access denied: only deal participants or admin can view consignment slip");
  }

  if (!deal?.consignment_slip) fail(404, "No consignment slip found");
  res.set("X-Content-Type-Options", "nosniff");
  res.type(deal.consignment_slip_type || "image/jpeg").send(deal.consignment_slip);
});

router.get("/:code/unboxing-photo", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isSeller = Number(req.user.id) === Number(deal.seller_id);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id);
  const isAdminUser = isAdmin(req.user);

  if (!isSeller && !isBuyer && !isAdminUser) {
    fail(403, "Access denied: only deal participants or admin can view unboxing photo");
  }

  if (!deal?.unboxing_photo) fail(404, "No unboxing photo found");
  res.set("X-Content-Type-Options", "nosniff");
  res.type(deal.unboxing_photo_type || "image/jpeg").send(deal.unboxing_photo);
});

/** Courier status simulation (allowed only in non-production for admin) */
router.post("/:code/simulate-courier", auth, adminOnly, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    fail(403, "Simulation endpoint disabled in production");
  }
  const deal = await loadDeal(req.params.code);
  const status = req.body.status; // 'picked_up', 'in_transit', 'delivered', 'refused', 'returned'
  if (!["picked_up", "in_transit", "delivered", "refused", "returned"].includes(status)) {
    fail(400, "Invalid courier simulation status");
  }

  const updated = await applyCourier(deal, status);
  res.json(await view(updated, req.user));
});

export default router;
