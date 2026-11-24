import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { one, q, transaction } from "../db.js";
import { adminOnly, auth, fail, isAdmin, optionalAuth } from "../http.js";
import { PHONE } from "./auth.js";
import { getBuyer, successRatio, isTrustedBuyer } from "../services/trust.js";
import { scoreOrder } from "../services/risk.js";
import { log, notify, notifySeller } from "../services/events.js";
import { computeAmounts } from "../services/amounts.js";
import {
  callGeminiMismatch,
  evaluateMismatchRules,
  executeMismatchDecision,
} from "../services/mismatch.js";
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
  const maxDiscountSetting = Number(await getSetting("trusted_max_discount_percent", 70));

  const trustInfo = await isTrustedBuyer(deal.buyer_phone);

  const amounts = computeAmounts({
    dealType: deal.deal_type,
    mode: deal.payment_mode,
    price: deal.price,
    charge: deal.delivery_charge,
    returnCharge: deal.return_charge,
    feePercent: deal.fee_percent || feePercent,
    feeMin,
    minDeposit,
    trustedDiscountPercent: deal.trusted_discount_percent || 0,
    isTrusted: trustInfo.trusted,
    trustedMaxDiscountPercent: maxDiscountSetting,
  });

  let installments = [];
  try {
    installments = await q(
      "select id, seq, amount, due_at, status, trx_id, sender_phone, payment_method, submitted_at, confirmed_at, created_at from deal_installments where deal_id=$1 order by seq asc",
      [deal.id]
    );
  } catch (_e) {}

  let evidenceList = [];
  try {
    evidenceList = await q(
      "select id, role, kind, mime, sha256, created_at from dispute_evidence where deal_id=$1 order by id asc",
      [deal.id]
    );
  } catch (_e) {}

  let decisionRecord = null;
  if (deal.decision_record) {
    try {
      decisionRecord = JSON.parse(deal.decision_record);
    } catch (_e) {}
  }

  const dealView = {
    ...rest,
    payment_mode: deal.payment_mode || (deal.deal_type === "product" ? "delivery_only" : "full_payment"),
    held_amount: deal.held_amount > 0 ? deal.held_amount : amounts.held_amount,
    cod_amount: deal.cod_amount !== undefined && deal.cod_amount !== null ? deal.cod_amount : amounts.cod_amount,
    total_amount: deal.total_amount || amounts.total_amount,
    fee_amount: deal.fee_amount !== undefined && deal.fee_amount !== null ? deal.fee_amount : amounts.fee_amount,
    seller_payout: deal.seller_payout !== undefined && deal.seller_payout !== null ? deal.seller_payout : amounts.seller_payout,
    trusted_discount_percent: deal.trusted_discount_percent || 0,
    trusted_discount_applied: deal.trusted_discount_applied || 0,
    discount_applied: deal.trusted_discount_applied || 0,
    trusted: !!(deal.is_buyer_trusted || trustInfo.trusted),
    trusted_reasons: trustInfo.reasons,
    has_consignment_slip: !!consignment_slip,
    has_unboxing_photo: !!unboxing_photo,
    buyer_phone: isParticipant ? buyer_phone : mask(buyer_phone),
    mismatch_status: deal.mismatch_status || "none",
    seller_response_deadline: deal.seller_response_deadline || null,
    claim_reason: deal.claim_reason || "",
    decision_record: decisionRecord,
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
      trusted: trustInfo.trusted,
      reasons: trustInfo.reasons,
    },
    installments: installments || [],
    evidence: isParticipant ? (evidenceList || []) : [],
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

router.post("/", auth, upload.array("listing_photos", 3), async (req, res) => {
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

  // Check buyer open liabilities
  const openLiability = await one(
    "select sum(amount) as total from buyer_liabilities where phone=$1 and status='open'",
    [b.buyer_phone.trim()]
  );
  if (openLiability && Number(openLiability.total) > 0) {
    fail(400, `Buyer has ${openLiability.total} BDT in unpaid liabilities from a previously refused order. New deals cannot be created until this liability is cleared.`);
  }

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
  const maxDiscountSetting = Number(await getSetting("trusted_max_discount_percent", 70));

  const offeredDiscount = Math.min(
    maxDiscountSetting,
    Math.max(0, Math.round(Number(b.trusted_discount_percent) || 0))
  );

  const trustInfo = await isTrustedBuyer(b.buyer_phone);
  const isTrusted = trustInfo.trusted;

  const amounts = computeAmounts({
    dealType,
    mode: effectiveMode,
    price,
    charge,
    returnCharge,
    feePercent,
    feeMin,
    minDeposit,
    trustedDiscountPercent: offeredDiscount,
    isTrusted,
    trustedMaxDiscountPercent: maxDiscountSetting,
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
       code, deal_type, payment_mode, cod_amount, held_amount,
       trusted_discount_percent, trusted_discount_applied, is_buyer_trusted,
       seller_id, buyer_id, buyer_phone, buyer_name, address, area, product, details,
       price, delivery_charge, total_amount, fee_amount, fee_percent, seller_payout, deposit,
       return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
     ) values(
       $1, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22, $23,
       $24, $25, $26, $27, $28, $29, $30
     ) returning *`,
    [
      code,
      dealType,
      effectiveMode,
      amounts.cod_amount,
      amounts.held_amount,
      offeredDiscount,
      amounts.discount_applied,
      isTrusted ? 1 : 0,
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

  // Handle 1-3 listing photos (from multipart upload or base64 JSON)
  const filesToProcess = [];
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    for (const f of req.files) {
      filesToProcess.push({ buffer: f.buffer, mime: f.mimetype });
    }
  } else if (Array.isArray(b.listing_photos) && b.listing_photos.length > 0) {
    for (const p of b.listing_photos.slice(0, 3)) {
      if (typeof p === "string" && p.includes("base64,")) {
        const [meta, raw] = p.split("base64,");
        const mime = meta.replace("data:", "").replace(";", "") || "image/jpeg";
        filesToProcess.push({ buffer: Buffer.from(raw, "base64"), mime });
      } else if (typeof p === "string") {
        filesToProcess.push({ buffer: Buffer.from(p, "base64"), mime: "image/jpeg" });
      }
    }
  }

  for (const item of filesToProcess) {
    const sha = createHash("sha256").update(item.buffer).digest("hex");
    const dup = await one("select deal_id from dispute_evidence where sha256=$1 and deal_id != $2 limit 1", [sha, deal.id]);
    if (dup) {
      fail(400, "Photo has already been used in another deal. Reused photos are not permitted.");
    }
    await q(
      `insert into dispute_evidence(deal_id, role, kind, photo, mime, sha256)
       values($1, 'seller', 'listing', $2, $3, $4)`,
      [deal.id, item.buffer, item.mime || "image/jpeg", sha]
    );
  }

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
         held_amount=$4,
         total_amount=$5,
         fee_amount=$6,
         seller_payout=$7,
         deposit=$5,
         updated_at=CURRENT_TIMESTAMP
       where id=$1 and status in ('created', 'payment_pending')
       returning *`,
      [deal.id, newMode, amounts.cod_amount, amounts.held_amount, amounts.total_amount, amounts.fee_amount, amounts.seller_payout]
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

router.post("/:code/ship", auth, upload.fields([{ name: "consignment_slip", maxCount: 1 }, { name: "pre_dispatch_photo", maxCount: 1 }]), async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.seller_id !== req.user.id) fail(403, "Not your deal");
  if (!["held", "partially_funded"].includes(deal.status)) {
    fail(400, "Deal is not in held or partially funded status");
  }

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

  const consignmentFile = req.files?.consignment_slip?.[0] || req.file;
  const consignmentSlip = consignmentFile?.buffer || null;
  const consignmentSlipType = consignmentFile?.mimetype || "";

  // Pre-dispatch evidence photo handling
  const preDispatchFile = req.files?.pre_dispatch_photo?.[0];
  let preDispatchBuffer = preDispatchFile?.buffer || null;
  let preDispatchMime = preDispatchFile?.mimetype || "image/jpeg";

  if (!preDispatchBuffer && req.body.pre_dispatch_photo) {
    const raw = req.body.pre_dispatch_photo;
    if (typeof raw === "string" && raw.includes("base64,")) {
      const [meta, b64] = raw.split("base64,");
      preDispatchMime = meta.replace("data:", "").replace(";", "") || "image/jpeg";
      preDispatchBuffer = Buffer.from(b64, "base64");
    } else if (typeof raw === "string") {
      preDispatchBuffer = Buffer.from(raw, "base64");
    }
  }

  if (preDispatchBuffer) {
    const sha = createHash("sha256").update(preDispatchBuffer).digest("hex");
    const dup = await one("select deal_id from dispute_evidence where sha256=$1 and deal_id != $2 limit 1", [sha, deal.id]);
    if (dup) {
      fail(400, "Pre-dispatch photo has already been used in another deal. Reused photos are not permitted.");
    }
    await q(
      `insert into dispute_evidence(deal_id, role, kind, photo, mime, sha256)
       values($1, 'seller', 'pre_dispatch', $2, $3, $4)`,
      [deal.id, preDispatchBuffer, preDispatchMime, sha]
    );
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
    if (!consignmentSlip) fail(400, "Please upload consignment slip photo for manual courier audit");
  } else {
    if (trackingId.length < 3) fail(400, "Enter a valid courier tracking ID");
  }

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

/**
 * ============================================================================
 * CHALLENGE 1B: Flexible Deposit Installments
 * ============================================================================
 */
router.post("/:code/installment-plan", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id) || req.user.phone === deal.buyer_phone;
  if (!isBuyer && !isAdmin(req.user)) {
    fail(403, "Only the buyer can select an installment plan");
  }
  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "Installment plan can only be created before payment is confirmed");
  }

  const count = parseInt(req.body.count, 10);
  if (![1, 2, 3].includes(count)) {
    fail(400, "Installment count must be between 1 and 3");
  }

  const total = Number(deal.total_amount);
  const fee = Number(deal.fee_amount || 0);
  const held = Number(deal.held_amount > 0 ? deal.held_amount : total - fee);

  const shipHours = Number(await getSetting("ship_within_hours", config.shipWithinHours || 48));
  const nowMs = Date.now();
  const maxDueMs = nowMs + shipHours * 36e5;

  const plan = [];
  if (count === 1) {
    plan.push({
      seq: 1,
      amount: total,
      due_at: new Date(nowMs + 24 * 36e5).toISOString(),
    });
  } else if (count === 2) {
    // First >= 40% of held deposit + fee
    const firstHeld = Math.ceil(held * 0.4);
    const inst1Amount = firstHeld + fee;
    const inst2Amount = total - inst1Amount;

    plan.push({
      seq: 1,
      amount: inst1Amount,
      due_at: new Date(nowMs + 12 * 36e5).toISOString(),
    });
    plan.push({
      seq: 2,
      amount: inst2Amount,
      due_at: new Date(Math.min(maxDueMs - 4 * 36e5, nowMs + 36 * 36e5)).toISOString(),
    });
  } else if (count === 3) {
    // First >= 40% of held deposit + fee
    const firstHeld = Math.ceil(held * 0.4);
    const inst1Amount = firstHeld + fee;
    const remaining = total - inst1Amount;
    const inst2Amount = Math.floor(remaining / 2);
    const inst3Amount = remaining - inst2Amount;

    plan.push({
      seq: 1,
      amount: inst1Amount,
      due_at: new Date(nowMs + 12 * 36e5).toISOString(),
    });
    plan.push({
      seq: 2,
      amount: inst2Amount,
      due_at: new Date(nowMs + 24 * 36e5).toISOString(),
    });
    plan.push({
      seq: 3,
      amount: inst3Amount,
      due_at: new Date(Math.min(maxDueMs - 4 * 36e5, nowMs + 36 * 36e5)).toISOString(),
    });
  }

  // Delete any unconfirmed previous installments
  await q("delete from deal_installments where deal_id = $1 and status in ('pending', 'submitted')", [deal.id]);

  for (const item of plan) {
    await q(
      `insert into deal_installments(deal_id, seq, amount, due_at, status)
       values($1, $2, $3, $4, 'pending')`,
      [deal.id, item.seq, item.amount, item.due_at]
    );
  }

  const updatedInstallments = await q(
    "select * from deal_installments where deal_id = $1 order by seq asc",
    [deal.id]
  );

  res.json({ ok: true, count, installments: updatedInstallments });
});

router.post("/:code/installments/:seq/pay", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id) || req.user.phone === deal.buyer_phone;
  if (!isBuyer && !isAdmin(req.user)) {
    fail(403, "Only the buyer can pay an installment");
  }

  const seq = parseInt(req.params.seq, 10);
  const inst = await one("select * from deal_installments where deal_id=$1 and seq=$2", [deal.id, seq]);
  if (!inst) fail(404, `Installment #${seq} not found`);
  if (inst.status === "confirmed") {
    fail(400, `Installment #${seq} is already confirmed`);
  }

  const trxId = (req.body.trx_id || req.body.trxId || "").trim().toUpperCase();
  const paymentMethod = (req.body.payment_method || "bKash").trim();
  const senderPhone = (req.body.sender_phone || req.user.phone || "").trim();

  if (!trxId) fail(400, "Transaction ID (TrxID) is required");
  if (!PHONE.test(senderPhone)) fail(400, "Valid 11-digit sender phone number is required");

  // Prevent duplicate TrxID across installments
  const dup = await one(
    "select id from deal_installments where trx_id = $1 and id != $2 and status != 'rejected'",
    [trxId, inst.id]
  );
  if (dup) fail(400, "This TrxID was already submitted for an installment");

  await q(
    `update deal_installments set
       status='submitted',
       trx_id=$1,
       payment_method=$2,
       sender_phone=$3,
       submitted_at=CURRENT_TIMESTAMP
     where id=$4`,
    [trxId, paymentMethod, senderPhone, inst.id]
  );

  if (deal.status === "created") {
    await q("update deals set status='payment_pending', updated_at=CURRENT_TIMESTAMP where id=$1", [deal.id]);
  }

  await log(
    deal.id,
    "installment_submitted",
    `Buyer submitted installment #${seq} payment (${inst.amount} BDT, TrxID: ${trxId}). Awaiting admin verification.`,
    { actor: "buyer" }
  );

  res.json({ ok: true, installment: await one("select * from deal_installments where id=$1", [inst.id]) });
});

/**
 * ============================================================================
 * CHALLENGE 2: Delivered But Wrong Item Claim & Settlement
 * ============================================================================
 */
router.post(
  "/:code/claim-mismatch",
  auth,
  upload.fields([
    { name: "parcel_label", maxCount: 1 },
    { name: "unboxing_item", maxCount: 1 },
  ]),
  async (req, res) => {
    const deal = await loadDeal(req.params.code);
    const isBuyer = Number(req.user.id) === Number(deal.buyer_id) || req.user.phone === deal.buyer_phone;
    if (!isBuyer && !isAdmin(req.user)) {
      fail(403, "Only the buyer can file a wrong item claim");
    }
    if (deal.status !== "delivered") {
      fail(400, "Item mismatch claim can only be filed after parcel delivery");
    }

    if (deal.confirm_by && new Date() > new Date(deal.confirm_by)) {
      fail(400, "Inspection confirmation window has expired");
    }

    // Rate limit: 3 claims per 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 36e5).toISOString();
    const pastClaims = await one(
      `select count(*) as cnt from deals
       where buyer_phone = $1
         and claim_reason != ''
         and created_at > $2`,
      [deal.buyer_phone, thirtyDaysAgo]
    );
    if (Number(pastClaims?.cnt || 0) >= 3) {
      fail(429, "You have reached the maximum limit of 3 mismatch claims within 30 days.");
    }

    const reason = (req.body.reason || req.body.claim_reason || "").trim();
    if (reason.length < 5) {
      fail(400, "Please provide a clear reason describing the mismatch");
    }

    const labelFile = req.files?.parcel_label?.[0];
    const itemFile = req.files?.unboxing_item?.[0];

    let labelBuffer = labelFile?.buffer || null;
    let labelMime = labelFile?.mimetype || "image/jpeg";
    let itemBuffer = itemFile?.buffer || null;
    let itemMime = itemFile?.mimetype || "image/jpeg";

    if (!labelBuffer && req.body.parcel_label) {
      const raw = req.body.parcel_label;
      if (typeof raw === "string" && raw.includes("base64,")) {
        const [meta, b64] = raw.split("base64,");
        labelMime = meta.replace("data:", "").replace(";", "") || "image/jpeg";
        labelBuffer = Buffer.from(b64, "base64");
      } else if (typeof raw === "string") {
        labelBuffer = Buffer.from(raw, "base64");
      }
    }

    if (!itemBuffer && req.body.unboxing_item) {
      const raw = req.body.unboxing_item;
      if (typeof raw === "string" && raw.includes("base64,")) {
        const [meta, b64] = raw.split("base64,");
        itemMime = meta.replace("data:", "").replace(";", "") || "image/jpeg";
        itemBuffer = Buffer.from(b64, "base64");
      } else if (typeof raw === "string") {
        itemBuffer = Buffer.from(raw, "base64");
      }
    }

    if (!labelBuffer) fail(400, "Shipping parcel label photo is required (tracking ID must be visible)");
    if (!itemBuffer) fail(400, "Unboxing photo of the delivered item is required");

    const labelSha = createHash("sha256").update(labelBuffer).digest("hex");
    const itemSha = createHash("sha256").update(itemBuffer).digest("hex");

    const dupLabel = await one(
      "select deal_id from dispute_evidence where sha256=$1 and deal_id != $2 limit 1",
      [labelSha, deal.id]
    );
    const dupItem = await one(
      "select deal_id from dispute_evidence where sha256=$1 and deal_id != $2 limit 1",
      [itemSha, deal.id]
    );

    const hasReusedPhoto = !!(dupLabel || dupItem);

    const labelEvidence = await one(
      `insert into dispute_evidence(deal_id, role, kind, photo, mime, sha256)
       values($1, 'buyer', 'parcel_label', $2, $3, $4) returning id`,
      [deal.id, labelBuffer, labelMime, labelSha]
    );
    const itemEvidence = await one(
      `insert into dispute_evidence(deal_id, role, kind, photo, mime, sha256)
       values($1, 'buyer', 'unboxing_item', $2, $3, $4) returning id`,
      [deal.id, itemBuffer, itemMime, itemSha]
    );

    const sellerRespHours = Number(await getSetting("seller_response_hours", 24));
    const sellerDeadline = new Date(Date.now() + sellerRespHours * 36e5).toISOString();

    await q(
      `update deals set
         mismatch_status = 'pending_seller_response',
         seller_response_deadline = $2,
         claim_reason = $3,
         auto_release_paused = 1,
         updated_at = CURRENT_TIMESTAMP
       where id = $1`,
      [deal.id, sellerDeadline, reason]
    );

    await log(
      deal.id,
      "mismatch_claimed",
      `Buyer filed item mismatch claim: "${reason}". Auto-release paused. Seller response window active for ${sellerRespHours} hours.`,
      { actor: "buyer" }
    );

    await notifySeller(
      deal.seller_id,
      `PakkaDeal #${deal.code}: Buyer reported receiving a wrong or mismatched item. Please review evidence and respond within ${sellerRespHours} hours.`,
      "Item Mismatch Claim Filed",
      deal.code
    );

    const listingPhotos = await q(
      "select photo, mime from dispute_evidence where deal_id=$1 and kind='listing'",
      [deal.id]
    );
    const preDispatch = await one(
      "select photo, mime from dispute_evidence where deal_id=$1 and kind='pre_dispatch'",
      [deal.id]
    );

    const aiResult = await callGeminiMismatch({
      listingPhotos: listingPhotos || [],
      preDispatchPhoto: preDispatch || null,
      buyerItemPhoto: { photo: itemBuffer, mime: itemMime },
      productTitle: deal.product,
      buyerReason: reason,
    });

    const ruleEval = evaluateMismatchRules({
      aiResult,
      hasLabelPhoto: true,
      hasReusedPhoto,
    });

    const decisionRecord = JSON.stringify({
      rule: ruleEval.rule,
      recommended_outcome: ruleEval.outcome,
      explanation: ruleEval.explanation,
      ai_result: aiResult,
      evidence_ids: [labelEvidence?.id, itemEvidence?.id].filter(Boolean),
      timestamp: new Date().toISOString(),
    });

    await q("update deals set decision_record = $2 where id = $1", [deal.id, decisionRecord]);

    const refreshed = await loadDeal(req.params.code);
    res.json(await view(refreshed, req.user));
  }
);

router.post("/:code/seller-mismatch-response", auth, upload.single("seller_photo"), async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.seller_id !== req.user.id && !isAdmin(req.user)) {
    fail(403, "Only the seller can respond to this mismatch claim");
  }
  if (deal.mismatch_status !== "pending_seller_response" && deal.mismatch_status !== "admin_review") {
    fail(400, "Deal is not in seller response review status");
  }

  const responseText = (req.body.response_text || "").trim();
  const sellerPhoto = req.file?.buffer || null;
  const sellerPhotoMime = req.file?.mimetype || "image/jpeg";

  if (sellerPhoto) {
    const sha = createHash("sha256").update(sellerPhoto).digest("hex");
    await q(
      `insert into dispute_evidence(deal_id, role, kind, photo, mime, sha256)
       values($1, 'seller', 'seller_rebuttal', $2, $3, $4)`,
      [deal.id, sellerPhoto, sellerPhotoMime, sha]
    );
  }

  await log(
    deal.id,
    "seller_mismatch_response",
    `Seller responded to mismatch claim: "${responseText || "Attached photo proof"}"`,
    { actor: "seller" }
  );

  let decisionRecord = {};
  try {
    decisionRecord = deal.decision_record ? JSON.parse(deal.decision_record) : {};
  } catch (_e) {}

  const aiResult = decisionRecord.ai_result || { match: "uncertain", confidence: 50 };
  const ruleEval = evaluateMismatchRules({
    aiResult,
    hasLabelPhoto: true,
    hasReusedPhoto: false,
  });

  const updatedDeal = await executeMismatchDecision({
    deal,
    outcome: ruleEval.outcome,
    rule: ruleEval.rule,
    aiResult,
    evidenceIds: decisionRecord.evidence_ids || [],
    adminNotes: `Resolved after seller response: ${responseText}`,
  });

  res.json(await view(updatedDeal, req.user));
});

router.get("/:code/evidence/:id", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isSeller = Number(req.user.id) === Number(deal.seller_id);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id);
  const isAdminUser = isAdmin(req.user);

  if (!isSeller && !isBuyer && !isAdminUser) {
    fail(403, "Access denied: only deal participants or admin can view evidence");
  }

  const evidence = await one(
    "select photo, mime from dispute_evidence where id=$1 and deal_id=$2",
    [req.params.id, deal.id]
  );
  if (!evidence || !evidence.photo) fail(404, "Evidence photo not found");

  res.set("X-Content-Type-Options", "nosniff");
  res.type(evidence.mime || "image/jpeg").send(evidence.photo);
});

router.post("/buyer-liabilities/pay", auth, async (req, res) => {
  const userPhone = req.user.phone;
  const openLiabilities = await q(
    "select * from buyer_liabilities where phone = $1 and status = 'open'",
    [userPhone]
  );
  if (!openLiabilities || openLiabilities.length === 0) {
    return res.json({ ok: true, message: "No open liabilities found", cleared: 0 });
  }

  const total = openLiabilities.reduce((sum, r) => sum + r.amount, 0);
  await q(
    "update buyer_liabilities set status = 'cleared', cleared_at = CURRENT_TIMESTAMP where phone = $1 and status = 'open'",
    [userPhone]
  );

  res.json({ ok: true, message: `Successfully cleared ${total} BDT in outstanding liabilities`, cleared: total });
});

export default router;
