import { Router } from "express";
import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { one, q } from "../db.js";
import { auth, fail, optionalAuth, role } from "../http.js";
import { PHONE } from "./auth.js";
import { getBuyer, depositFor, successRatio } from "../services/trust.js";
import { scoreOrder } from "../services/risk.js";
import { log, notify, notifySeller } from "../services/events.js";
import {
  applyPayment,
  applyShip,
  applyCourier,
  releaseToSeller,
  applyHandoverConfirmation,
  checkAllTimeouts,
  calculateFee,
} from "../services/settle.js";

const router = Router();

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
    "select id, kind, note, created_at from deal_events where deal_id=$1 order by id asc",
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

  const { buyer_phone, ...rest } = deal;
  return {
    deal: {
      ...rest,
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
  res.json(rows);
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

  await log(deal.id, "created", `Deal created by ${req.user.page_name || req.user.name || "seller"}`);
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
  const deal = await loadDeal(req.params.code);
  res.json(await view(deal, req.user));
});

router.post("/:code/pay", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (req.user.phone !== deal.buyer_phone) fail(403, "Only the designated buyer can pay for this deal");
  if (deal.status !== "created") fail(400, "Deal cannot be paid in status: " + deal.status);

  const updated = await applyPayment(deal, req.body.payment_method || "bKash");
  res.json(await view(updated, req.user));
});

router.post("/:code/ship", auth, role("seller"), async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.seller_id !== req.user.id) fail(403, "Not your deal");
  if (deal.status !== "held") fail(400, "Deal is not in held status");

  const trackingId = (req.body.tracking_id || "").trim();
  const courierName = (req.body.courier_name || deal.courier_name || "Steadfast").trim();
  if (trackingId.length < 3) fail(400, "Enter a valid courier tracking ID");

  const updated = await applyShip(deal, courierName, trackingId);
  res.json(await view(updated, req.user));
});

router.post("/:code/confirm", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (deal.deal_type === "product") {
    if (req.user.phone !== deal.buyer_phone) fail(403, "Only the buyer can confirm product receipt");
    if (deal.status !== "delivered") fail(400, "Product must be marked delivered before confirmation");
    const updated = await releaseToSeller(deal, "buyer_confirmed");
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
  await q(
    `update deals set status='return_requested', outcome='return_requested', updated_at=datetime('now') where id=$1`,
    [deal.id]
  );
  await log(deal.id, "return_requested", `Buyer requested return: ${reason}`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Buyer requested return (${reason}). Please coordinate return shipping.`);
  res.json(await view(await loadDeal(deal.code), req.user));
});

router.post("/:code/ship-return", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  if (req.user.phone !== deal.buyer_phone) fail(403, "Only the buyer can ship return");
  if (deal.status !== "return_requested") fail(400, "Return has not been requested for this deal");

  const trackingId = (req.body.return_tracking_id || "").trim();
  const courierName = (req.body.return_courier_name || "Pathao").trim();
  if (trackingId.length < 3) fail(400, "Enter return tracking ID");

  await q(
    `update deals set status='return_shipped', return_courier_name=$2, return_tracking_id=$3, return_courier_status='in_transit', updated_at=datetime('now') where id=$1`,
    [deal.id, courierName, trackingId]
  );
  await log(deal.id, "return_shipped", `Buyer dispatched return via ${courierName} (Tracking: ${trackingId})`);
  await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Return dispatched (${courierName} ${trackingId}). Inspect on arrival.`);
  res.json(await view(await loadDeal(deal.code), req.user));
});

/** Demo courier status simulation */
router.post("/:code/simulate-courier", auth, async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const status = req.body.status; // 'picked_up', 'in_transit', 'delivered', 'refused'
  if (!["picked_up", "in_transit", "delivered", "refused"].includes(status)) {
    fail(400, "Invalid courier simulation status");
  }

  const updated = await applyCourier(deal, status);
  res.json(await view(updated, req.user));
});

export default router;
