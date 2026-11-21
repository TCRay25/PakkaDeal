import { Router } from "express";
import { randomBytes } from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { one, q } from "../db.js";
import { auth, fail, optionalAuth } from "../http.js";
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

export async function loadDeal(code) {
  const deal = await one("select * from deals where code=$1", [code]);
  if (!deal) fail(404, "Deal not found");
  return deal;
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

  const isSeller = !!user && user.id === deal.seller_id;
  const isBuyer = !!user && user.phone === deal.buyer_phone;
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

  return {
    deal: {
      ...rest,
      has_consignment_slip: !!consignment_slip,
      has_unboxing_photo: !!unboxing_photo,
      buyer_phone: isSeller || isBuyer || isAdminUser ? buyer_phone : mask(buyer_phone),
    },
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
    me: {
      is_seller: isSeller,
      is_buyer: isBuyer,
      is_admin: isAdminUser,
    },
    escrow_accounts: escrowAccounts,
  };
}

router.get("/", auth, async (req, res) => {
  const { status, type, q: search } = req.query;
  await checkAllTimeouts();

  let query = `
    select d.*, u.page_name, u.name as seller_name
    from deals d
    join users u on u.id = d.seller_id
    where (d.seller_id = $1 or d.buyer_phone = $2)
  `;
  const params = [req.user.id, req.user.phone];

  if (status) {
    params.push(status);
    query += ` and d.status = $${params.length}`;
  }
  if (type) {
    params.push(type);
    query += ` and d.deal_type = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    query += ` and (d.product like $${params.length} or d.code like $${params.length} or d.buyer_name like $${params.length})`;
  }

  query += ` order by d.id desc`;
  const rows = await q(query, params);

  // Strip blobs
  const cleanRows = rows.map(({ consignment_slip, unboxing_photo, ...d }) => ({
    ...d,
    has_consignment_slip: !!consignment_slip,
    has_unboxing_photo: !!unboxing_photo,
  }));

  res.json(cleanRows);
});

router.post("/", auth, async (req, res) => {
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

  const totalAmount = price + charge;
  const feeAmount = await calculateFee(totalAmount);
  const sellerPayout = totalAmount - feeAmount;

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
       price, delivery_charge, total_amount, fee_amount, seller_payout, deposit,
       return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
     ) values(
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
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
    `PakkaDeal: ${req.user.page_name || req.user.name} invited you to deal #${deal.code} for "${deal.product}". Total: ${totalAmount} BDT. Pay into escrow to proceed.`,
    "New Deal Invitation",
    deal.code
  );

  res.status(201).json(deal);
});

router.get("/:code", optionalAuth, async (req, res) => {
  await checkAllTimeouts();
  let deal = await loadDeal(req.params.code);

  // Transition from created -> payment_pending when designated buyer views the link
  if (req.user && req.user.phone === deal.buyer_phone && deal.status === "created") {
    await q("update deals set status='payment_pending', updated_at=datetime('now') where id=$1", [deal.id]);
    await log(deal.id, "payment_pending", "Buyer opened deal link. Awaiting escrow payment.", {
      fromStatus: "created",
      toStatus: "payment_pending",
      actor: "buyer",
    });
    deal = await loadDeal(req.params.code);
  }

  res.json(await view(deal, req.user));
});

router.post("/:code/pay", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (req.user.phone !== deal.buyer_phone) fail(403, "Only the designated buyer can pay for this deal");
  if (!["created", "payment_pending"].includes(deal.status)) {
    fail(400, "Deal cannot be paid in status: " + deal.status);
  }

  const paymentMethod = (req.body.payment_method || "bKash").trim();
  const senderNumber = (req.body.sender_number || req.user.phone).trim();
  const trxId = (req.body.trx_id || `MOCK-${Date.now().toString(36).toUpperCase()}`).trim();

  if (senderNumber && !PHONE.test(senderNumber)) {
    fail(400, "Please provide a valid 11-digit sender phone number");
  }

  const updated = await applyPayment(deal, { paymentMethod, senderNumber, trxId });
  res.json(await view(updated, req.user));
});

router.post("/:code/ship", auth, upload.single("consignment_slip"), async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.seller_id !== req.user.id) fail(403, "Not your deal");
  if (deal.status !== "held") fail(400, "Deal is not in held status");

  const trackingId = (req.body.tracking_id || "").trim();
  const courierName = (req.body.courier_name || deal.courier_name || "Steadfast").trim();
  const courierPhone = (req.body.courier_phone || "").trim();
  const isManualCourier = courierName.toLowerCase() === "other" || req.body.is_manual_courier === "1" || req.body.is_manual_courier === true;

  if (isManualCourier) {
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

  res.json(await view(updated, req.user));
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
