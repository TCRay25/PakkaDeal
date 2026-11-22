import { Router } from "express";
import { q, one, isSqliteDb } from "../db.js";
import { adminOnly, auth, fail, isAdmin } from "../http.js";
import { config } from "../config.js";
import {
  adminForceRelease,
  adminForceRefund,
  adminSplitResolution,
  getPublicSettings,
  applyPayment,
  addLedger,
} from "../services/settle.js";
import { log, notify, notifySeller } from "../services/events.js";
import { emitGlobal } from "../services/socket.js";

const router = Router();
router.use(auth, adminOnly);

router.get("/overview", async (_req, res) => {
  try {
    let sums = null;
    try {
      sums = await one(`
        select
          coalesce(sum(case when status in ('held', 'shipped', 'delivered', 'return_requested', 'return_shipped', 'disputed') then coalesce(deposit, total_amount, 0) else 0 end), 0) as held_amount,
          count(case when status in ('held', 'shipped', 'delivered', 'return_requested', 'return_shipped', 'disputed') then 1 else null end) as held_count,
          coalesce(sum(case when status = 'released' then coalesce(seller_payout, total_amount - fee_amount, 0) else 0 end), 0) as released_amount,
          count(case when status = 'released' then 1 else null end) as released_count,
          coalesce(sum(case when status = 'refunded' then coalesce(total_amount, 0) else 0 end), 0) as refunded_amount,
          count(case when status = 'refunded' then 1 else null end) as refunded_count,
          coalesce(sum(case when status in ('released', 'refunded') then coalesce(fee_amount, 0) else 0 end), 0) as fee_earned,
          count(*) as total_deals
        from deals
      `);
    } catch (dealErr) {
      console.warn("Detailed deals aggregate failed, falling back to safe defaults:", dealErr.message);
      const countRow = await one("select count(*) as total_deals from deals");
      sums = {
        held_amount: 0,
        held_count: 0,
        released_amount: 0,
        released_count: 0,
        refunded_amount: 0,
        refunded_count: 0,
        fee_earned: 0,
        total_deals: countRow?.total_deals || 0,
      };
    }

    const openDisputes = await one("select count(*) as n from disputes where status='open'");
    const totalUsers = await one("select count(*) as n from users");
    const pendingPaymentsCount = await one(`
      select count(*) as n from deals
      where (payment_status = 'pending' or (status = 'payment_pending' and payment_trx_id != ''))
        and payment_status != 'confirmed'
    `);
    const pendingPayoutsCount = await one(`
      select count(*) as n from deals
      where status = 'released' and coalesce(payout_status, 'pending') != 'paid'
    `);
    const activeReturnsCount = await one(`
      select count(*) as n from deals
      where status in ('return_requested', 'return_shipped', 'return_received')
         or (status = 'refunded' and (return_buyer_trx_id = '' or return_seller_trx_id = ''))
    `);

    const dailySql = isSqliteDb()
      ? `select
           strftime('%Y-%m-%d', created_at) as day,
           count(*) as deals,
           coalesce(sum(total_amount), 0) as total_volume
         from deals
         where created_at > datetime('now', '-30 days')
         group by 1
         order by 1 asc`
      : `select
           to_char(created_at at time zone 'Asia/Dhaka', 'YYYY-MM-DD') as day,
           count(*) as deals,
           coalesce(sum(total_amount), 0) as total_volume
         from deals
         where created_at > now() - interval '30 days'
         group by 1
         order by 1 asc`;

    const daily = await q(dailySql);

    res.json({
      ...sums,
      open_disputes: openDisputes?.n || 0,
      total_users: totalUsers?.n || 0,
      pending_payments: pendingPaymentsCount?.n || 0,
      pending_payouts: pendingPayoutsCount?.n || 0,
      active_returns: activeReturnsCount?.n || 0,
      daily: daily || [],
    });
  } catch (err) {
    console.error("Admin overview error:", err);
    res.status(500).json({ detail: "Failed to load overview: " + err.message });
  }
});

router.get("/deals", async (req, res) => {
  const { status, type, filter, q: search } = req.query;
  let query = `
    select d.*, u.page_name, u.name as seller_name, u.phone as seller_phone
    from deals d
    join users u on u.id = d.seller_id
    where 1=1
  `;
  const params = [];

  if (status && status !== "all") {
    params.push(status);
    query += ` and d.status = $${params.length}`;
  }
  if (type && type !== "all") {
    params.push(type);
    query += ` and d.deal_type = $${params.length}`;
  }

  // Quick Filters
  if (filter === "held") {
    query += ` and d.status in ('held', 'shipped', 'delivered', 'in_transit')`;
  } else if (filter === "countdown") {
    query += ` and d.status = 'delivered' and d.auto_release_paused = 0`;
  } else if (filter === "manual") {
    query += ` and d.is_manual_courier = 1`;
  } else if (filter === "disputed") {
    query += ` and d.status = 'disputed'`;
  }

  if (search) {
    params.push(`%${search}%`);
    query += ` and (d.product like $${params.length} or d.code like $${params.length} or d.buyer_phone like $${params.length} or u.phone like $${params.length})`;
  }

  query += ` order by d.id desc limit 150`;
  const rows = await q(query, params);

  // Strip blobs
  const cleanRows = rows.map(({ consignment_slip, unboxing_photo, ...d }) => ({
    ...d,
    has_consignment_slip: !!consignment_slip,
    has_unboxing_photo: !!unboxing_photo,
  }));

  res.json(cleanRows);
});

router.post("/deals/:code/force-release", async (req, res) => {
  const deal = await one("select * from deals where code=$1", [req.params.code]);
  if (!deal) fail(404, "Deal not found");
  const adminNotes = (req.body.admin_notes || "Force released by administrator").trim();
  const updated = await adminForceRelease(deal, adminNotes, "admin");
  res.json({ ok: true, deal: updated });
});

router.post("/deals/:code/force-refund", async (req, res) => {
  const deal = await one("select * from deals where code=$1", [req.params.code]);
  if (!deal) fail(404, "Deal not found");
  const adminNotes = (req.body.admin_notes || "Force refunded to buyer by administrator").trim();
  const updated = await adminForceRefund(deal, adminNotes, "admin");
  res.json({ ok: true, deal: updated });
});

router.post("/deals/:code/split-resolution", async (req, res) => {
  const deal = await one("select * from deals where code=$1", [req.params.code]);
  if (!deal) fail(404, "Deal not found");
  const sellerAmount = Math.max(0, Math.round(Number(req.body.seller_amount || 0)));
  const buyerAmount = Math.max(0, Math.round(Number(req.body.buyer_amount || 0)));
  const adminNotes = (req.body.admin_notes || "Split resolution by administrator").trim();

  const updated = await adminSplitResolution(deal, sellerAmount, buyerAmount, adminNotes, "admin");
  res.json({ ok: true, deal: updated });
});

router.post("/deals/:code/audit-courier", async (req, res) => {
  const deal = await one("select * from deals where code=$1", [req.params.code]);
  if (!deal) fail(404, "Deal not found");

  const status = req.body.status; // 'approved' | 'rejected'
  if (!["approved", "rejected"].includes(status)) {
    fail(400, "Audit status must be 'approved' or 'rejected'");
  }

  await q("update deals set manual_audit_status=$2, updated_at=CURRENT_TIMESTAMP where id=$1", [deal.id, status]);
  await log(deal.id, "courier_audit", `Manual courier slip marked ${status} by admin.`, {
    fromStatus: deal.status,
    toStatus: deal.status,
    actor: "admin",
  });

  res.json({ ok: true, manual_audit_status: status });
});

router.get("/users", async (req, res) => {
  const { q: search } = req.query;
  const adminPhones = config.adminPhones || ["01700000000"];
  let query = `
    select u.id, u.phone, u.uid, u.name, u.email, u.role, u.page_name, u.page_url,
           u.bkash_number, u.bkash_type, u.bkash_verified,
           u.seller_trust, u.buyer_trust, u.is_suspended, u.created_at,
           (select count(*) from deals where seller_id = u.id) as seller_deals_count,
           (select count(*) from deals where buyer_phone = u.phone) as buyer_deals_count
    from users u
    where 1=1
  `;
  const params = [];
  if (adminPhones.length > 0) {
    const placeholders = adminPhones.map((_, i) => `$${params.length + i + 1}`).join(",");
    query += ` and u.phone not in (${placeholders})`;
    params.push(...adminPhones);
  }
  query += ` and lower(coalesce(u.role, '')) != 'admin' and lower(coalesce(u.name, '')) not like '%admin%'`;
  if (search) {
    params.push(`%${search}%`);
    query += ` and (u.phone like $${params.length} or u.name like $${params.length} or u.page_name like $${params.length} or u.email like $${params.length} or u.bkash_number like $${params.length})`;
  }
  query += ` order by u.id desc limit 100`;
  const rows = await q(query, params);
  res.json(rows);
});

router.post("/users/:id/suspend", async (req, res) => {
  const user = await one("select * from users where id=$1", [req.params.id]);
  if (!user) fail(404, "User not found");
  if (isAdmin(user) || (config.adminPhones || ["01700000000"]).includes(user.phone)) {
    fail(400, "Cannot suspend an administrator account");
  }
  const nextState = user.is_suspended ? 0 : 1;
  await q("update users set is_suspended=$2 where id=$1", [user.id, nextState]);
  res.json({ ok: true, is_suspended: !!nextState });
});

router.post("/users/:id/verify-bkash", async (req, res) => {
  const user = await one("select * from users where id=$1", [req.params.id]);
  if (!user) fail(404, "User not found");
  const nextState = user.bkash_verified ? 0 : 1;
  await q("update users set bkash_verified=$2 where id=$1", [user.id, nextState]);
  res.json({ ok: true, bkash_verified: !!nextState });
});

router.get("/ledger", async (req, res) => {
  const rows = await q(`
    select l.id, l.deal_id, l.transaction_type, l.amount, l.party_phone, l.balance_after, l.notes, l.created_at,
           d.code as deal_code, d.product as deal_product
    from ledger l
    left join deals d on d.id = l.deal_id
    order by l.id desc limit 200
  `);
  res.json(rows);
});

router.get("/notifications", async (_req, res) => {
  const rows = await q(`
    select id, phone, title, message, deal_code, is_read, created_at
    from notifications
    order by id desc limit 100
  `);
  res.json(rows);
});

/**
 * GET /admin/shipments
 * Query: ?tracking=manual|failed|stuck|all&q=search
 */
router.get("/shipments", async (req, res) => {
  const filter = req.query.tracking || req.query.filter || "all";
  const search = (req.query.q || "").trim();

  const stuckCondition = isSqliteDb()
    ? "d.last_tracking_update < datetime('now', '-48 hours')"
    : "d.last_tracking_update < now() - interval '48 hours'";

  // Fetch summary counters
  const countsRow = await one(`
    select
      count(*) as total,
      count(case when d.is_manual_courier = 1 then 1 else null end) as manual,
      count(case when d.standardized_status = 'delivery_failed' or coalesce(d.poll_failure_count, 0) > 3 then 1 else null end) as failed,
      count(case when d.status in ('shipped', 'in_transit') and ${stuckCondition} then 1 else null end) as stuck
    from deals d
    where (d.tracking_id is not null and d.tracking_id != '')
       or d.status in ('shipped', 'in_transit', 'delivered')
  `);

  let query = `
    select
      d.id, d.code, d.product, d.status, d.courier_name, d.tracking_id, d.is_manual_courier,
      d.courier_phone, d.detection_confidence, d.tracking_source, d.standardized_status,
      d.raw_courier_status, d.current_location, d.estimated_delivery_at, d.last_tracking_update,
      d.last_polled_at, d.poll_failure_count, d.manual_audit_status, d.buyer_phone, d.buyer_name,
      d.total_amount, d.created_at, d.updated_at,
      u.name as seller_name, u.phone as seller_phone, u.page_name
    from deals d
    join users u on u.id = d.seller_id
    where ((d.tracking_id is not null and d.tracking_id != '')
       or d.status in ('shipped', 'in_transit', 'delivered'))
  `;
  const params = [];

  if (filter === "manual") {
    query += " and d.is_manual_courier = 1";
  } else if (filter === "failed") {
    query += " and (d.standardized_status = 'delivery_failed' or coalesce(d.poll_failure_count, 0) > 3)";
  } else if (filter === "stuck") {
    query += ` and d.status in ('shipped', 'in_transit') and ${stuckCondition}`;
  }

  if (search) {
    params.push(`%${search}%`);
    query += ` and (
      d.tracking_id like $${params.length}
      or d.code like $${params.length}
      or d.product like $${params.length}
      or d.courier_name like $${params.length}
      or d.buyer_phone like $${params.length}
      or u.phone like $${params.length}
    )`;
  }

  query += " order by d.id desc limit 150";
  const rows = await q(query, params);

  res.json({
    counts: {
      total: Number(countsRow?.total) || 0,
      manual: Number(countsRow?.manual) || 0,
      failed: Number(countsRow?.failed) || 0,
      stuck: Number(countsRow?.stuck) || 0,
    },
    shipments: rows || [],
  });
});

/**
 * ============================================================================
 * PENDING PAYMENTS (Buyer deposits awaiting admin confirmation)
 * ============================================================================
 */
router.get("/payments/pending", async (req, res) => {
  const search = (req.query.trx_id || req.query.q || "").trim();
  let query = `
    select d.id, d.code, d.product, d.price, d.delivery_charge, d.total_amount, d.deposit,
           d.buyer_name, d.buyer_phone, d.payment_method, d.payment_sender, d.payment_trx_id,
           d.payment_amount, d.payment_status, d.payment_submitted_at, d.payment_rejection_reason,
           d.status, d.created_at,
           u.name as seller_name, u.phone as seller_phone, u.page_name
    from deals d
    join users u on u.id = d.seller_id
    where (d.payment_status = 'pending' or (d.status = 'payment_pending' and d.payment_trx_id != ''))
      and d.payment_status != 'confirmed'
  `;
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    query += ` and (d.payment_trx_id like $${params.length} or d.code like $${params.length} or d.buyer_phone like $${params.length} or d.payment_sender like $${params.length} or d.buyer_name like $${params.length})`;
  }
  query += ` order by d.id desc limit 100`;

  const rows = await q(query, params);
  const formatted = rows.map((r) => {
    const declaredAmount = Number(r.payment_amount) || Number(r.total_amount);
    const expectedAmount = Number(r.total_amount);
    return {
      ...r,
      declared_amount: declaredAmount,
      expected_amount: expectedAmount,
      amount_mismatch: declaredAmount !== expectedAmount,
    };
  });

  res.json(formatted);
});

router.post("/payments/:id/confirm", async (req, res) => {
  const deal = await one("select * from deals where id=$1", [req.params.id]);
  if (!deal) fail(404, "Deal not found");
  if (deal.payment_status === "confirmed" || deal.status === "held") {
    fail(400, "Payment for this deal is already confirmed and held in escrow");
  }

  // Security: double check unique payment_trx_id
  if (deal.payment_trx_id) {
    const existing = await one(
      "select id, code from deals where payment_trx_id=$1 and id != $2 and payment_status='confirmed'",
      [deal.payment_trx_id, deal.id]
    );
    if (existing) {
      fail(400, `This TrxID (${deal.payment_trx_id}) was already confirmed for deal #${existing.code}`);
    }
  }

  const updated = await applyPayment(deal, {
    paymentMethod: deal.payment_method || "bKash",
    senderNumber: deal.payment_sender || deal.buyer_phone,
    trxId: deal.payment_trx_id,
  });

  await q(
    `update deals set payment_status='confirmed', updated_at=CURRENT_TIMESTAMP where id=$1`,
    [deal.id]
  );

  await log(
    deal.id,
    "payment_confirmed",
    `Payment confirmed by admin (${req.user.phone}). Funds locked in escrow. TrxID: ${deal.payment_trx_id}`,
    {
      fromStatus: deal.status,
      toStatus: "held",
      actor: "admin",
    }
  );

  res.json({ ok: true, deal: updated });
});

router.post("/payments/:id/reject", async (req, res) => {
  const deal = await one("select * from deals where id=$1", [req.params.id]);
  if (!deal) fail(404, "Deal not found");
  const reason = (req.body.reason || "").trim();
  if (!reason) {
    fail(400, "Please provide a rejection reason for the buyer");
  }

  await q(
    `update deals set
       payment_status='rejected',
       payment_rejection_reason=$2,
       status='payment_pending',
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, reason]
  );

  await log(
    deal.id,
    "payment_rejected",
    `Payment rejected by admin (${req.user.phone}). Reason: ${reason}`,
    {
      fromStatus: deal.status,
      toStatus: "payment_pending",
      actor: "admin",
    }
  );

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: আপনার পেমেন্ট বাতিল করা হয়েছে (${deal.payment_trx_id || "TrxID"}). কারণ: ${reason}। অনুগ্রহ করে যাচাই করে পুনরায় পেমেন্ট তথ্য দিন।`,
    "Payment Rejected",
    deal.code
  );

  res.json({ ok: true, reason });
});

/**
 * ============================================================================
 * PENDING PAYOUTS (Delivered / Released deals waiting for seller bKash disbursement)
 * ============================================================================
 */
router.get("/payouts/pending", async (req, res) => {
  const search = (req.query.q || "").trim();
  let query = `
    select d.id, d.code, d.product, d.total_amount, d.fee_amount, d.fee_percent,
           d.seller_payout, d.status, d.outcome, d.created_at, d.updated_at,
           d.payout_status, d.payout_trx_id, d.payout_at,
           u.id as seller_id, u.name as seller_name, u.phone as seller_phone, u.page_name,
           u.bkash_number as seller_bkash_number, u.bkash_type as seller_bkash_type,
           u.bkash_verified as seller_bkash_verified
    from deals d
    join users u on u.id = d.seller_id
    where d.status = 'released'
      and coalesce(d.payout_status, 'pending') != 'paid'
  `;
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    query += ` and (d.code like $${params.length} or d.product like $${params.length} or u.phone like $${params.length} or u.name like $${params.length} or u.bkash_number like $${params.length})`;
  }
  query += ` order by d.id desc limit 150`;

  const rows = await q(query, params);
  res.json(rows);
});

router.post("/payouts/:id/pay", async (req, res) => {
  const deal = await one("select * from deals where id=$1", [req.params.id]);
  if (!deal) fail(404, "Deal not found");
  if (deal.status !== "released") {
    fail(400, "Payout can only be disbursed for released deals");
  }
  if (deal.payout_status === "paid") {
    fail(400, "This deal has already been marked as paid out");
  }

  const payoutTrxId = (req.body.payout_trx_id || "").trim();
  if (!payoutTrxId) {
    fail(400, "Please provide the bKash Payout Transaction ID (TrxID)");
  }

  // Security: check uniqueness of payout_trx_id
  const duplicate = await one(
    "select id, code from deals where payout_trx_id=$1 and id != $2",
    [payoutTrxId, deal.id]
  );
  if (duplicate) {
    fail(400, `This Payout TrxID (${payoutTrxId}) was already recorded for deal #${duplicate.code}`);
  }

  // Security: Enforce seller bKash verification
  const seller = await one("select * from users where id=$1", [deal.seller_id]);
  if (!seller || !seller.bkash_verified) {
    fail(400, "Seller bKash account is not verified by admin. Please verify seller bKash first before disbursing payout.");
  }

  await q(
    `update deals set
       payout_status='paid',
       payout_trx_id=$2,
       payout_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, payoutTrxId]
  );

  await addLedger({
    dealId: deal.id,
    type: "payout_seller",
    amount: deal.seller_payout,
    partyPhone: seller.bkash_number || seller.phone,
    notes: `bKash Payout disbursed by admin (${req.user.phone}) to ${seller.bkash_number} (${seller.bkash_type}). TrxID: ${payoutTrxId}`,
  });

  await log(
    deal.id,
    "payout_completed",
    `Seller payout of ${deal.seller_payout} BDT successfully disbursed via bKash by admin (${req.user.phone}). TrxID: ${payoutTrxId}`,
    {
      fromStatus: deal.status,
      toStatus: deal.status,
      actor: "admin",
    }
  );

  await notifySeller(
    deal.seller_id,
    `PakkaDeal #${deal.code}: আপনার অ্যাকাউন্টে ${deal.seller_payout.toLocaleString()} BDT পেআউট পাঠানো হয়েছে (${seller.bkash_number})। TrxID: ${payoutTrxId}`,
    "bKash Payout Disbursed",
    deal.code
  );

  res.json({ ok: true, payout_trx_id: payoutTrxId });
});

/**
 * ============================================================================
 * RETURNS MANAGEMENT (Compensation to seller & refunds to buyer)
 * ============================================================================
 */
router.get("/returns", async (req, res) => {
  const search = (req.query.q || "").trim();
  let query = `
    select d.id, d.code, d.product, d.price, d.delivery_charge, d.return_charge,
           d.total_amount, d.fee_amount, d.status, d.outcome, d.created_at, d.updated_at,
           d.return_courier_name, d.return_tracking_id, d.return_courier_status,
           d.return_seller_trx_id, d.return_seller_paid_at,
           d.return_buyer_trx_id, d.return_buyer_paid_at,
           s.id as seller_id, s.name as seller_name, s.phone as seller_phone,
           s.bkash_number as seller_bkash_number, s.bkash_type as seller_bkash_type,
           s.bkash_verified as seller_bkash_verified,
           b.id as buyer_id, b.name as buyer_name, b.phone as buyer_phone,
           b.bkash_number as buyer_bkash_number, b.bkash_type as buyer_bkash_type
    from deals d
    join users s on s.id = d.seller_id
    left join users b on (b.phone = d.buyer_phone or b.id = d.buyer_id)
    where d.status in ('return_requested', 'return_shipped', 'return_received', 'refunded')
       or d.outcome in ('return_received', 'refused_at_door', 'admin_forced_refund', 'admin_split_resolution', 'return_requested')
  `;
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    query += ` and (d.code like $${params.length} or d.product like $${params.length} or s.phone like $${params.length} or d.buyer_phone like $${params.length})`;
  }
  query += ` order by d.id desc limit 100`;

  const rows = await q(query, params);
  const formatted = rows.map((r) => {
    const deliveryAndReturn = Number(r.delivery_charge || 0) + Number(r.return_charge || r.delivery_charge || 0);
    const sellerAmount = deliveryAndReturn;
    const buyerRefund = Math.max(0, Number(r.total_amount) - deliveryAndReturn - Number(r.fee_amount || 0));

    return {
      ...r,
      seller_compensation_amount: sellerAmount,
      buyer_refund_amount: buyerRefund,
      seller_paid: Boolean(r.return_seller_trx_id),
      buyer_paid: Boolean(r.return_buyer_trx_id),
    };
  });

  res.json(formatted);
});

router.post("/returns/:id/pay-seller", async (req, res) => {
  const deal = await one("select * from deals where id=$1", [req.params.id]);
  if (!deal) fail(404, "Deal not found");
  if (deal.return_seller_trx_id) {
    fail(400, "Seller shipping compensation has already been paid for this deal");
  }

  const trxId = (req.body.trx_id || "").trim();
  if (!trxId) {
    fail(400, "Please provide the bKash TrxID for seller shipping compensation");
  }

  const duplicate = await one(
    "select id, code from deals where return_seller_trx_id=$1 and id != $2",
    [trxId, deal.id]
  );
  if (duplicate) {
    fail(400, `This TrxID was already used for deal #${duplicate.code}`);
  }

  const deliveryAndReturn = Number(deal.delivery_charge || 0) + Number(deal.return_charge || deal.delivery_charge || 0);
  const seller = await one("select * from users where id=$1", [deal.seller_id]);

  await q(
    `update deals set
       return_seller_trx_id=$2,
       return_seller_paid_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, trxId]
  );

  await addLedger({
    dealId: deal.id,
    type: "payout_seller",
    amount: deliveryAndReturn,
    partyPhone: seller?.bkash_number || seller?.phone || "",
    notes: `Seller return/refusal shipping compensation paid via bKash. TrxID: ${trxId}`,
  });

  await log(
    deal.id,
    "return_seller_paid",
    `Seller shipping compensation of ${deliveryAndReturn} BDT paid via bKash by admin (${req.user.phone}). TrxID: ${trxId}`,
    {
      fromStatus: deal.status,
      toStatus: deal.status,
      actor: "admin",
    }
  );

  if (seller) {
    await notifySeller(
      seller.id,
      `PakkaDeal #${deal.code}: রিটার্ন/ডেলিভারি ক্ষতিপূরণ বাবদ ${deliveryAndReturn} BDT বিকাশ করা হয়েছে (${seller.bkash_number || seller.phone})। TrxID: ${trxId}`,
      "Shipping Compensation Paid",
      deal.code
    );
  }

  res.json({ ok: true, return_seller_trx_id: trxId });
});

router.post("/returns/:id/pay-buyer", async (req, res) => {
  const deal = await one("select * from deals where id=$1", [req.params.id]);
  if (!deal) fail(404, "Deal not found");
  if (deal.return_buyer_trx_id) {
    fail(400, "Buyer refund has already been paid for this deal");
  }

  const trxId = (req.body.trx_id || "").trim();
  if (!trxId) {
    fail(400, "Please provide the bKash TrxID for buyer refund");
  }

  const duplicate = await one(
    "select id, code from deals where return_buyer_trx_id=$1 and id != $2",
    [trxId, deal.id]
  );
  if (duplicate) {
    fail(400, `This TrxID was already used for deal #${duplicate.code}`);
  }

  const deliveryAndReturn = Number(deal.delivery_charge || 0) + Number(deal.return_charge || deal.delivery_charge || 0);
  const refundAmount = Math.max(0, Number(deal.total_amount) - deliveryAndReturn - Number(deal.fee_amount || 0));

  await q(
    `update deals set
       return_buyer_trx_id=$2,
       return_buyer_paid_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP
     where id=$1`,
    [deal.id, trxId]
  );

  await addLedger({
    dealId: deal.id,
    type: "refund_buyer",
    amount: refundAmount,
    partyPhone: deal.payment_sender || deal.buyer_phone,
    notes: `Buyer return refund paid via bKash. TrxID: ${trxId}`,
  });

  await log(
    deal.id,
    "return_buyer_refunded",
    `Buyer refund of ${refundAmount} BDT paid via bKash by admin (${req.user.phone}). TrxID: ${trxId}`,
    {
      fromStatus: deal.status,
      toStatus: deal.status,
      actor: "admin",
    }
  );

  await notify(
    deal.buyer_phone,
    `PakkaDeal #${deal.code}: আপনার রিটার্ন রিফান্ড বাবদ ${refundAmount} BDT বিকাশ করা হয়েছে। TrxID: ${trxId}`,
    "Refund Paid via bKash",
    deal.code
  );

  res.json({ ok: true, return_buyer_trx_id: trxId });
});

/**
 * ============================================================================
 * PAID OUT / HISTORY (All completed payouts, refunds, and compensations)
 * ============================================================================
 */
router.get("/history", async (req, res) => {
  const { type = "all", q: search } = req.query;

  let query = `
    select d.id, d.code, d.product, d.total_amount, d.fee_amount, d.seller_payout,
           d.delivery_charge, d.return_charge, d.status, d.outcome, d.created_at, d.updated_at,
           d.payout_status, d.payout_trx_id, d.payout_at,
           d.return_seller_trx_id, d.return_seller_paid_at,
           d.return_buyer_trx_id, d.return_buyer_paid_at,
           s.name as seller_name, s.phone as seller_phone, s.bkash_number as seller_bkash_number,
           b.name as buyer_name, b.phone as buyer_phone, b.bkash_number as buyer_bkash_number
    from deals d
    join users s on s.id = d.seller_id
    left join users b on (b.phone = d.buyer_phone or b.id = d.buyer_id)
    where (d.payout_status = 'paid' or d.return_seller_trx_id != '' or d.return_buyer_trx_id != '')
  `;
  const params = [];

  if (search) {
    params.push(`%${search.trim()}%`);
    query += ` and (
      d.code like $${params.length}
      or d.product like $${params.length}
      or d.payout_trx_id like $${params.length}
      or d.return_seller_trx_id like $${params.length}
      or d.return_buyer_trx_id like $${params.length}
      or s.phone like $${params.length}
      or d.buyer_phone like $${params.length}
    )`;
  }

  query += ` order by coalesce(d.payout_at, d.return_buyer_paid_at, d.return_seller_paid_at, d.updated_at) desc limit 200`;

  const rows = await q(query, params);
  const history = [];

  for (const r of rows) {
    if (r.payout_status === "paid" && r.payout_trx_id) {
      if (type === "all" || type === "seller_payout") {
        history.push({
          id: `payout-${r.id}`,
          deal_id: r.id,
          deal_code: r.code,
          deal_product: r.product,
          transaction_type: "seller_payout",
          type_label: "Seller Payout (বিক্রেতার পাওনা)",
          recipient_name: r.seller_name,
          recipient_phone: r.seller_phone,
          recipient_bkash: r.seller_bkash_number || r.seller_phone,
          amount: Number(r.seller_payout),
          trx_id: r.payout_trx_id,
          date: r.payout_at || r.updated_at,
        });
      }
    }

    if (r.return_seller_trx_id) {
      if (type === "all" || type === "return_compensation") {
        const deliveryAndReturn = Number(r.delivery_charge || 0) + Number(r.return_charge || r.delivery_charge || 0);
        history.push({
          id: `ret-seller-${r.id}`,
          deal_id: r.id,
          deal_code: r.code,
          deal_product: r.product,
          transaction_type: "return_compensation",
          type_label: "Shipping Compensation (শিপিং ক্ষতিপূরণ)",
          recipient_name: r.seller_name,
          recipient_phone: r.seller_phone,
          recipient_bkash: r.seller_bkash_number || r.seller_phone,
          amount: deliveryAndReturn,
          trx_id: r.return_seller_trx_id,
          date: r.return_seller_paid_at || r.updated_at,
        });
      }
    }

    if (r.return_buyer_trx_id) {
      if (type === "all" || type === "buyer_refund") {
        const deliveryAndReturn = Number(r.delivery_charge || 0) + Number(r.return_charge || r.delivery_charge || 0);
        const buyerRefund = Math.max(0, Number(r.total_amount) - deliveryAndReturn - Number(r.fee_amount || 0));
        history.push({
          id: `ret-buyer-${r.id}`,
          deal_id: r.id,
          deal_code: r.code,
          deal_product: r.product,
          transaction_type: "buyer_refund",
          type_label: "Buyer Refund (ক্রেতার রিফান্ড)",
          recipient_name: r.buyer_name || "Buyer",
          recipient_phone: r.buyer_phone,
          recipient_bkash: r.buyer_bkash_number || r.buyer_phone,
          amount: buyerRefund,
          trx_id: r.return_buyer_trx_id,
          date: r.return_buyer_paid_at || r.updated_at,
        });
      }
    }
  }

  res.json(history);
});

router.get("/settings", async (_req, res) => {
  const rows = await q("select key, value, description from settings order by key");
  res.json(rows);
});

router.patch("/settings", async (req, res) => {
  const updates = req.body; // e.g. { platform_fee_percent: "2.5", confirm_window_hours: "48" }
  if (!updates || typeof updates !== "object") fail(400, "Invalid settings object");

  for (const [key, value] of Object.entries(updates)) {
    await q(
      `insert into settings(key, value) values($1, $2)
       on conflict(key) do update set value=$2`,
      [key, String(value)]
    );
  }

  const rows = await q("select key, value, description from settings order by key");
  const publicSettings = await getPublicSettings();
  emitGlobal("settings:updated", publicSettings);
  res.json({ ok: true, settings: rows });
});

export default router;
