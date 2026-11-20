import { Router } from "express";
import { one, q } from "../db.js";
import { auth, fail } from "../http.js";
import { getBuyer } from "../services/trust.js";

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
  const { name, page_name, page_url } = req.body;
  const user = await one(
    `update users set
       name = coalesce($2, name),
       page_name = coalesce($3, page_name),
       page_url = coalesce($4, page_url)
     where id=$1 returning *`,
    [
      req.user.id,
      name !== undefined ? String(name).slice(0, 80).trim() : null,
      page_name !== undefined ? String(page_name).slice(0, 80).trim() : null,
      page_url !== undefined ? String(page_url).slice(0, 255).trim() : null,
    ]
  );
  res.json({ user });
});

router.get("/seller/:id", async (req, res) => {
  const s = await one(
    "select id, name, phone, page_name, page_url, seller_trust, created_at from users where id=$1",
    [req.params.id]
  );
  if (!s) fail(404, "Seller profile not found");
  const stats = await sellerStats(s.id);
  res.json({ seller: s, stats });
});

export default router;
