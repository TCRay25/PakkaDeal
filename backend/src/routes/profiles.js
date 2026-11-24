import { Router } from "express";
import { one, q } from "../db.js";
import { auth, fail } from "../http.js";
import { getBuyer } from "../services/trust.js";
import { PHONE } from "./auth.js";

const router = Router();

const sellerStats = async (id) => {
  try {
    const row = await one(
      `select
         count(*) filter (where outcome in ('delivered', 'buyer_confirmed', 'both_confirmed', 'auto_release_timeout')) as completed,
         count(*) filter (where outcome in ('refused', 'refused_at_door')) as refused,
         count(*) filter (where outcome = 'dispute_upheld') as disputes,
         count(*) filter (where status in ('held', 'shipped', 'delivered')) as active_deals
       from deals where seller_id=$1`,
      [id]
    );
    return {
      completed: Number(row?.completed || 0),
      refused: Number(row?.refused || 0),
      disputes: Number(row?.disputes || 0),
      active_deals: Number(row?.active_deals || 0),
    };
  } catch (err) {
    console.error("sellerStats error:", err);
    return { completed: 0, refused: 0, disputes: 0, active_deals: 0 };
  }
};

router.get("/me", auth, async (req, res) => {
  try {
    const sStats = await sellerStats(req.user.id);
    const bStats = await getBuyer(req.user.phone);

    const walletSummary = await one(
      `select
         coalesce(sum(amount) filter (where transaction_type = 'payout_seller'), 0) as total_earnings,
         coalesce(sum(amount) filter (where transaction_type = 'refund_buyer'), 0) as total_refunds_received,
         coalesce(sum(amount) filter (where transaction_type = 'hold'), 0) as total_escrow_deposited
       from ledger
       where party_phone = $1 or deal_id in (select id from deals where seller_id = $2)`,
      [req.user.phone, req.user.id]
    );

    const recentTransactions = await q(
      `select l.id, l.transaction_type, l.amount, l.notes, l.created_at, d.code as deal_code, d.product as deal_product
       from ledger l
       left join deals d on d.id = l.deal_id
       where l.party_phone = $1 or d.seller_id = $2
       order by l.id desc limit 50`,
      [req.user.phone, req.user.id]
    );

    res.json({
      user: req.user,
      buyer_stats: bStats || { delivered: 0, refused: 0, disputes: 0, refunded: 0, trust_score: 60 },
      seller_stats: sStats,
      wallet: {
        total_earnings: Number(walletSummary?.total_earnings || 0),
        total_refunds_received: Number(walletSummary?.total_refunds_received || 0),
        total_escrow_deposited: Number(walletSummary?.total_escrow_deposited || 0),
        transactions: recentTransactions || [],
      },
    });
  } catch (err) {
    console.error("Profile /me error:", err);
    res.status(500).json({ detail: "Failed to load profile details" });
  }
});

router.patch("/me", auth, async (req, res) => {
  const { name, page_name, page_url, bkash_number, bkash_type } = req.body;

  let cleanBkash = undefined;
  if (bkash_number !== undefined) {
    cleanBkash = String(bkash_number).trim();
    if (cleanBkash && !PHONE.test(cleanBkash)) {
      return fail(400, "Enter a valid 11-digit Bangladeshi bKash number (e.g. 017XXXXXXXX)");
    }
  }

  let cleanBkashType = undefined;
  if (bkash_type !== undefined) {
    const validBkashTypes = ["Personal", "Merchant", "Agent"];
    cleanBkashType = validBkashTypes.includes(bkash_type) ? bkash_type : "Personal";
  }

  const currentUser = await one("select * from users where id=$1", [req.user.id]);
  if (!currentUser) return fail(404, "User not found");

  // If bKash number is updated or changed, bkash_verified resets to 0 (false)
  const bkashChanged = cleanBkash !== undefined && cleanBkash !== currentUser.bkash_number;
  const newVerified = bkashChanged ? 0 : currentUser.bkash_verified;

  // Phone is strictly immutable after verification. PATCH /profiles/me must never change phone.
  const user = await one(
    `update users set
       name = coalesce($2, name),
       page_name = coalesce($3, page_name),
       page_url = coalesce($4, page_url),
       bkash_number = coalesce($5, bkash_number),
       bkash_type = coalesce($6, bkash_type),
       bkash_verified = $7
     where id=$1 returning *`,
    [
      req.user.id,
      name !== undefined ? String(name).slice(0, 80).trim() : null,
      page_name !== undefined ? String(page_name).slice(0, 80).trim() : null,
      page_url !== undefined ? String(page_url).slice(0, 255).trim() : null,
      cleanBkash !== undefined ? cleanBkash : null,
      cleanBkashType !== undefined ? cleanBkashType : null,
      newVerified,
    ]
  );
  res.json({ user });
});

router.get("/seller/:id", async (req, res) => {
  const param = String(req.params.id || "").trim();
  const numId = Number(param) || 0;
  const s = await one(
    "select id, public_id, name, page_name, page_url, seller_trust, created_at from users where public_id=$1 or id=$2",
    [param, numId]
  );
  if (!s) fail(404, "Seller profile not found");
  const stats = await sellerStats(s.id);
  const seller = {
    id: s.public_id || s.id,
    public_id: s.public_id || String(s.id),
    name: s.name,
    page_name: s.page_name,
    page_url: s.page_url,
    seller_trust: s.seller_trust,
    created_at: s.created_at,
  };
  res.json({ seller, stats });
});

export default router;
