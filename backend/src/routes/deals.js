import { Router } from "express";
import { randomBytes } from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { one, q } from "../db.js";
import { auth, fail, optionalAuth, makeToken } from "../http.js";
import { PHONE } from "./auth.js";
import { getBuyer, successRatio } from "../services/trust.js";
import { scoreOrder } from "../services/risk.js";
import { log, notify, notifySeller } from "../services/events.js";
import {
  applyPayment,
  applyShip,
  applyCourier,
  releaseToSeller,
  applyHandoverConfirmation,
  requestReturn,
  shipReturn,
  completeReturn,
  checkAllTimeouts,
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
    const deal = await one(
      "select * from deals where code=$1 or id=$2",
      [String(codeOrId), Number(codeOrId) || 0]
    );
    if (!deal) fail(404, "Deal not found");
    return deal;
  } catch (err) {
    if (err.message && err.message.includes('column "updated_at" of relation "deals" does not exist')) {
      try {
        await q("alter table deals add column if not exists updated_at timestamptz not null default now()");
        await q("alter table deals add column if not exists created_at timestamptz not null default now()");
        await q("alter table deals add column if not exists buyer_id int");
        const deal = await one(
          "select * from deals where code=$1 or id=$2",
          [String(codeOrId), Number(codeOrId) || 0]
        );
        if (!deal) fail(404, "Deal not found");
        return deal;
      } catch (innerErr) {
        throw err;
      }
    }
    throw err;
  }
}

const mask = (p) => (p && p.length >= 7 ? p.slice(0, 3) + "****" + p.slice(-3) : p);

async function view(deal, user) {
  const seller = await one(
    "select id, name, phone, page_name, page_url, seller_trust from users where id=$1",
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

  const userPhone11 = user?.phone ? user.phone.replace(/\D/g, "").slice(-11) : "";
  const dealBuyerPhone11 = deal.buyer_phone ? deal.buyer_phone.replace(/\D/g, "").slice(-11) : "";
  const sellerPhone11 = seller?.phone ? seller.phone.replace(/\D/g, "").slice(-11) : "";

  const isSeller = !!user && (Number(user.id) === Number(deal.seller_id) || (userPhone11 && userPhone11 === sellerPhone11));
  const isBuyer = !!user && (
    (deal.buyer_id && Number(user.id) === Number(deal.buyer_id)) ||
    (userPhone11 && userPhone11 === dealBuyerPhone11)
  );
  const isAdminUser = !!user && config.adminPhones.includes(user.phone);

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

  const dealView = {
    ...rest,
    has_consignment_slip: !!consignment_slip,
    has_unboxing_photo: !!unboxing_photo,
    buyer_phone: isSeller || isBuyer || isAdminUser ? buyer_phone : mask(buyer_phone),
  };

  // If the viewer is the seller, they do NOT see the buyer's escrow service fee
  if (isSeller && !isAdminUser) {
    dealView.fee_amount = 0;
    dealView.fee_percent = 0;
  }

  return {
    deal: dealView,
    seller,
    buyer: {
      phone: isSeller || isBuyer || isAdminUser ? deal.buyer_phone : mask(deal.buyer_phone),
      name: deal.buyer_name,
      trust_score: buyer.trust_score,
      delivered: buyer.delivered,
      refused: buyer.refused,
    },
    events,
    ledger: isSeller || isBuyer || isAdminUser ? ledgerEntries : [],
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
  await checkAllTimeouts();

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

  const baseSubtotal = price + charge;
  const feePercent = Number(await getSetting("platform_fee_percent", config.feePercent || 1));
  const feeAmount = await calculateFee(baseSubtotal);
  const totalAmount = baseSubtotal + feeAmount; // Buyer pays product + delivery + platform fee
  const sellerPayout = baseSubtotal; // Seller receives full 100% of price + delivery (0 fee deducted from seller)

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

  const code = "PK-" + randomBytes(4).toString("hex").toUpperCase();

  const deal = await one(
    `insert into deals(
       code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
       price, delivery_charge, total_amount, fee_amount, fee_percent, seller_payout, deposit,
       return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
     ) values(
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
     ) returning *`,
    [
      code,
      dealType,
      req.user.id,
      b.buyer_phone.trim(),
      b.buyer_name.trim(),
      b.address.trim(),
      b.area || "Dhaka",
      b.product.trim(),
      (b.details || "").trim(),
      price,
      charge,
      totalAmount,
      feeAmount,
      feePercent,
      sellerPayout,
      totalAmount,
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
    `PakkaDeal: ${req.user.page_name || req.user.name} invited you to deal #${deal.code} for "${deal.product}". Total: ${totalAmount} BDT (including ${feePercent}% escrow fee). Pay into escrow to proceed.`,
    "New Deal Invitation",
    deal.code
  );

  res.status(201).json(deal);
});

router.get("/:code", optionalAuth, async (req, res) => {
  await checkAllTimeouts();
  let deal = await loadDeal(req.params.code);

  // Transition from created -> payment_pending when designated buyer views the link
  const userPhone11 = req.user?.phone ? req.user.phone.replace(/\D/g, "").slice(-11) : "";
  const dealBuyerPhone11 = deal.buyer_phone ? deal.buyer_phone.replace(/\D/g, "").slice(-11) : "";
  const isBuyerUser = req.user && (
    (deal.buyer_id && Number(req.user.id) === Number(deal.buyer_id)) ||
    (userPhone11 && userPhone11 === dealBuyerPhone11)
  );

  if (isBuyerUser && deal.status === "created") {
    await q("update deals set status='payment_pending', updated_at=CURRENT_TIMESTAMP where id=$1", [deal.id]);
    await log(deal.id, "payment_pending", "Buyer opened deal link. Awaiting escrow payment.", {
      fromStatus: "created",
      toStatus: "payment_pending",
      actor: "buyer",
    });
    deal = await loadDeal(req.params.code);
  }

  res.json(await view(deal, req.user));
});

router.post("/:code/pay", optionalAuth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "Deal cannot be paid in status: " + deal.status);
  }

  const seller = await one("select id, phone from users where id=$1", [deal.seller_id]);
  const userPhone11 = req.user?.phone ? req.user.phone.replace(/\D/g, "").slice(-11) : "";
  const sellerPhone11 = seller?.phone ? seller.phone.replace(/\D/g, "").slice(-11) : "";

  // STRICT BUSINESS LOGIC: Seller CANNOT pay for their own deal!
  if (
    req.user && (
      Number(req.user.id) === Number(deal.seller_id) ||
      (userPhone11 && userPhone11 === sellerPhone11)
    )
  ) {
    fail(403, "আপনি এই ডিলের বিক্রেতা (Seller)। বিক্রেতা নিজের তৈরি করা ডিলে নিজে পেমেন্ট করতে পারবেন না। পেমেন্ট অবশ্যই বায়ার (ক্রেতা) কর্তৃক হতে হবে। লিংকটি বায়ারকে পাঠান।");
  }

  const paymentMethod = (req.body.payment_method || "bKash").trim();
  const senderNumber = (req.body.sender_number || req.user?.phone || deal.buyer_phone).trim();
  const trxId = (req.body.trx_id || `MOCK-${Date.now().toString(36).toUpperCase()}`).trim();

  if (senderNumber && !PHONE.test(senderNumber)) {
    fail(400, "Please provide a valid 11-digit sender phone number");
  }

  // Ensure buyer user exists in `users` table
  let buyerUser = req.user && Number(req.user.id) !== Number(deal.seller_id) ? req.user : null;
  if (!buyerUser) {
    buyerUser = await one("select * from users where phone=$1 or phone=$2", [deal.buyer_phone, senderNumber]);
  }
  if (!buyerUser) {
    buyerUser = await one(
      `insert into users(phone, name, role, page_name, seller_trust, buyer_trust)
       values($1, $2, 'buyer', '', 60, 60) returning *`,
      [deal.buyer_phone || senderNumber, deal.buyer_name || "Buyer " + (deal.buyer_phone || senderNumber).slice(-4)]
    );
  }

  // Link buyer_id on deal so buyer always sees it in their dashboard
  if (buyerUser?.id) {
    await q("update deals set buyer_id=$1 where id=$2", [buyerUser.id, deal.id]);
    deal.buyer_id = buyerUser.id;
  }

  const updated = await applyPayment(deal, { paymentMethod, senderNumber, trxId });
  const viewData = await view(updated, req.user || buyerUser);

  // If visitor was not logged in, return JWT token so they are immediately authenticated as the buyer!
  const token = req.user ? null : makeToken(buyerUser.id);

  res.json({
    ...viewData,
    token,
  });
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
    if (req.user.phone !== deal.buyer_phone) fail(403, "Only the buyer can confirm product receipt");
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
  if (req.user.phone !== deal.buyer_phone) fail(403, "Only the buyer can request a return");
  if (deal.status !== "delivered") fail(400, "Returns can only be requested after delivery");
  if (deal.return_policy === "no_returns") fail(400, "This deal has a no-return policy");

  const reason = (req.body.reason || "Buyer requested return").trim();
  const updated = await requestReturn(deal, reason, "buyer");
  res.json(await view(updated, req.user));
});

router.post("/:code/ship-return", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (req.user.phone !== deal.buyer_phone) fail(403, "Only the buyer can ship return");
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

router.get("/:code/consignment-slip", async (req, res) => {
  const deal = await one("select consignment_slip, consignment_slip_type from deals where code=$1", [req.params.code]);
  if (!deal?.consignment_slip) fail(404, "No consignment slip found");
  res.type(deal.consignment_slip_type || "image/jpeg").send(deal.consignment_slip);
});

router.get("/:code/unboxing-photo", async (req, res) => {
  const deal = await one("select unboxing_photo, unboxing_photo_type from deals where code=$1", [req.params.code]);
  if (!deal?.unboxing_photo) fail(404, "No unboxing photo found");
  res.type(deal.unboxing_photo_type || "image/jpeg").send(deal.unboxing_photo);
});

/** Demo courier status simulation */
router.post("/:code/simulate-courier", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const status = req.body.status; // 'picked_up', 'in_transit', 'delivered', 'refused', 'returned'
  if (!["picked_up", "in_transit", "delivered", "refused", "returned"].includes(status)) {
    fail(400, "Invalid courier simulation status");
  }

  const updated = await applyCourier(deal, status);
  res.json(await view(updated, req.user));
});

export default router;
