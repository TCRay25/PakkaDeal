import { Router } from "express";
import { q, one, isSqliteDb } from "../db.js";
import { adminOnly, auth, fail } from "../http.js";

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
  const { status, type, q: search } = req.query;
  let query = `
    select d.*, u.page_name, u.name as seller_name, u.phone as seller_phone
    from deals d
    join users u on u.id = d.seller_id
    where 1=1
  `;
  const params = [];

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
    query += ` and (d.product like $${params.length} or d.code like $${params.length} or d.buyer_phone like $${params.length} or u.phone like $${params.length})`;
  }

  query += ` order by d.id desc limit 150`;
  const rows = await q(query, params);
  res.json(rows);
});

router.get("/users", async (req, res) => {
  const { q: search } = req.query;
  let query = `
    select u.id, u.phone, u.name, u.role, u.page_name, u.page_url, u.seller_trust, u.buyer_trust,
           u.is_suspended, u.created_at,
           (select count(*) from deals where seller_id = u.id) as seller_deals_count,
           (select count(*) from deals where buyer_phone = u.phone) as buyer_deals_count
    from users u
    where 1=1
  `;
  const params = [];
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
  res.json({ ok: true, settings: rows });
});

export default router;
