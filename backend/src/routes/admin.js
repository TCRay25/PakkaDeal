import { Router } from "express";
import { q, one, isSqliteDb } from "../db.js";
import { adminOnly, auth, fail, isAdmin } from "../http.js";
import { config } from "../config.js";
import { adminForceRelease, adminForceRefund, adminSplitResolution, getPublicSettings } from "../services/settle.js";
import { log } from "../services/events.js";
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
    select u.id, u.phone, u.name, u.role, u.page_name, u.page_url, u.seller_trust, u.buyer_trust,
           u.is_suspended, u.created_at,
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
    query += ` and (u.phone like $${params.length} or u.name like $${params.length} or u.page_name like $${params.length})`;
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
