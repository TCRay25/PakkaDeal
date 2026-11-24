import { Router } from "express";
import multer from "multer";
import { one, q, transaction } from "../db.js";
import { adminOnly, auth, fail, isAdmin } from "../http.js";
import { loadDeal } from "./deals.js";
import { analyze } from "../services/disputeAi.js";
import { addLedger, calculateFee } from "../services/settle.js";
import { bumpBuyer, bumpSeller } from "../services/trust.js";
import { log, notify, notifySeller } from "../services/events.js";
import { emitToAdmin, emitToDeal } from "../services/socket.js";
import { computeAmounts } from "../services/amounts.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4 MB limit
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File must be an image under 4 MB (JPEG, PNG, WEBP)"));
    }
  },
});

router.post("/deals/:code/dispute", auth, upload.single("photo"), async (req, res) => {
  const deal = await loadDeal(req.params.code);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id);
  const isSeller = Number(req.user.id) === Number(deal.seller_id);

  if (!isBuyer && !isSeller) fail(403, "Only the buyer or seller can dispute this deal");
  if (!["held", "shipped", "delivered", "return_requested", "return_shipped", "refused"].includes(deal.status)) {
    fail(400, "This deal cannot be disputed in status: " + deal.status);
  }

  const reason = (req.body.reason || "").trim();
  const evidenceText = (req.body.evidence_text || "").trim();
  if (reason.length < 5) fail(400, "Please provide a clear description of the problem (at least 5 characters)");

  const photoBuffer = req.file?.buffer || null;
  const photoMime = req.file?.mimetype || "";

  const ai = await analyze({
    reason,
    product: deal.product,
    photo: photoBuffer,
    mime: photoMime,
  });

  const dispute = await one(
    `insert into disputes(
       deal_id, raised_by_phone, reason, category, evidence_text, photo, photo_type,
       ai_summary, ai_recommendation, status
     ) values($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open') returning id, status, ai_summary, ai_recommendation`,
    [
      deal.id,
      req.user.phone,
      reason,
      ai.category,
      evidenceText,
      photoBuffer,
      photoMime,
      ai.summary,
      ai.recommendation,
    ]
  );

  await q(`update deals set status='disputed', outcome='disputed', auto_release_paused=1, updated_at=CURRENT_TIMESTAMP where id=$1`, [deal.id]);
  await log(deal.id, "disputed", `Dispute opened by ${isBuyer ? "Buyer" : "Seller"}: ${reason}`);
  emitToAdmin("admin:dispute_opened", {
    disputeId: dispute.id,
    dealCode: deal.code,
    reason,
    category: ai.category,
    created_at: new Date().toISOString(),
  });
  emitToDeal(deal.code, "dispute:opened", {
    disputeId: dispute.id,
    dealCode: deal.code,
    reason,
  });
  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: Dispute submitted for admin review. Escrow funds remain frozen.`,
    "Dispute Under Review",
    deal.code
  );
  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: Buyer reported an issue. PakkaDeal admin will review evidence before funds move.`,
    "Dispute Alert",
    deal.code
  );

  res.status(201).json(dispute);
});

router.get("/disputes", auth, adminOnly, async (_req, res) => {
  const rows = await q(`
    select d.id, d.deal_id, d.raised_by_phone, d.reason, d.category, d.evidence_text,
           d.ai_summary, d.ai_recommendation, d.admin_notes, d.status, d.created_at,
           (d.photo is not null) as has_photo,
           deals.code as deal_code, deals.product, deals.total_amount, deals.price,
           deals.delivery_charge, deals.buyer_phone, deals.buyer_name, deals.seller_id,
           u.name as seller_name, u.page_name, u.phone as seller_phone
    from disputes d
    join deals on deals.id = d.deal_id
    join users u on u.id = deals.seller_id
    order by case when d.status = 'open' then 0 else 1 end, d.id desc
  `);
  res.json(rows);
});

router.get("/disputes/:id/photo", auth, async (req, res) => {
  const d = await one("select * from disputes where id=$1", [req.params.id]);
  if (!d) fail(404, "Dispute not found");

  const deal = await one("select seller_id, buyer_id from deals where id=$1", [d.deal_id]);
  if (!deal) fail(404, "Associated deal not found");

  const isSeller = Number(req.user.id) === Number(deal.seller_id);
  const isBuyer = Number(req.user.id) === Number(deal.buyer_id);
  const isAdminUser = isAdmin(req.user);

  if (!isSeller && !isBuyer && !isAdminUser) {
    fail(403, "Access denied: only dispute participants or admin can view evidence photo");
  }

  if (!d.photo) fail(404, "No photo attached to this dispute");
  res.set("X-Content-Type-Options", "nosniff");
  res.type(d.photo_type || "image/jpeg").send(d.photo);
});

router.post("/disputes/:id/decide", auth, adminOnly, async (req, res) => {
  const d = await one("select * from disputes where id=$1", [req.params.id]);
  if (!d || d.status !== "open") fail(400, "Dispute is already resolved or not found");

  const deal = await one("select * from deals where id=$1", [d.deal_id]);
  if (!deal) fail(404, "Associated deal not found");

  const decision = req.body.decision; // 'upheld' (buyer refunded) or 'rejected' (released to seller)
  const adminNotes = (req.body.admin_notes || "").trim();

  if (!["upheld", "rejected"].includes(decision)) {
    fail(400, "Decision must be 'upheld' or 'rejected'");
  }

  const isUpheld = decision === "upheld";

  await transaction(async () => {
    const updatedDispute = await q(
      `update disputes set status=$2, admin_notes=$3 where id=$1 and status='open' returning *`,
      [d.id, isUpheld ? "upheld" : "rejected", adminNotes]
    );
    if (updatedDispute.length !== 1) {
      fail(400, "Dispute is already resolved or not found");
    }

    if (isUpheld) {
      // Buyer refunded full amount (or full minus delivery depending on dispute reason)
      const refundAmount = deal.total_amount;
      const updatedDeal = await q(
        `update deals set status='refunded', outcome='dispute_upheld', updated_at=CURRENT_TIMESTAMP where id=$1 and status='disputed' returning *`,
        [deal.id]
      );
      if (updatedDeal.length === 1) {
        await addLedger({
          dealId: deal.id,
          type: "refund_buyer",
          amount: refundAmount,
          partyPhone: deal.buyer_phone,
          notes: `Admin upheld dispute #${d.id}. Full refund to buyer. Notes: ${adminNotes}`,
        });
        await bumpSeller(deal.seller_id, "disputes");
        await log(deal.id, "dispute_upheld", `Admin decided in favor of buyer: ${adminNotes || "Claim upheld"}`);
        await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Dispute upheld. Full refund of ${refundAmount} BDT processed.`);
        await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Dispute concluded. Refund granted to buyer.`);
      }
    } else {
      // Rejected: seller receives held payout (deal.seller_payout), fee goes to platform_fee
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

      const updatedDeal = await q(
        `update deals set status='released', outcome='dispute_rejected', updated_at=CURRENT_TIMESTAMP where id=$1 and status='disputed' returning *`,
        [deal.id]
      );
      if (updatedDeal.length === 1) {
        await addLedger({
          dealId: deal.id,
          type: "payout_seller",
          amount: payout,
          notes: `Admin rejected dispute #${d.id}. Funds released to seller. Notes: ${adminNotes}`,
        });
        await addLedger({
          dealId: deal.id,
          type: "platform_fee",
          amount: fee,
          notes: `Platform service fee for #${deal.code}`,
        });
        await bumpBuyer(deal.buyer_phone, "disputes");
        await log(deal.id, "dispute_rejected", `Admin rejected dispute: ${adminNotes || "Claim dismissed; seller paid"}`);
        await notify(deal.buyer_phone, `PakkaDeal #${deal.code}: Dispute reviewed and concluded in seller favor.`);
        await notifySeller(deal.seller_id, `PakkaDeal #${deal.code}: Dispute dismissed. ${payout} BDT released to your account.`);
      }
    }
  });

  emitToAdmin("admin:dispute_decided", {
    disputeId: d.id,
    dealCode: deal.code,
    decision,
  });
  emitToDeal(deal.code, "dispute:decided", {
    disputeId: d.id,
    dealCode: deal.code,
    decision,
  });

  res.json({ ok: true, status: isUpheld ? "upheld" : "rejected" });
});

export default router;
