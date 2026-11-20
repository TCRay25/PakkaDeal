import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isSqlite = false;
let sqliteDb = null;
let pgPool = null;
let initialized = false;

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;
  const dataDir = path.resolve(__dirname, "../data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "pakkadeal.sqlite");
  sqliteDb = new DatabaseSync(dbPath);
  sqliteDb.exec("PRAGMA journal_mode = WAL;");
  sqliteDb.exec("PRAGMA foreign_keys = ON;");
  return sqliteDb;
}

function pgToSqlite(sql, params = []) {
  const reordered = [];
  let s = sql.replace(/\$(\d+)/g, (_match, num) => {
    const idx = parseInt(num, 10) - 1;
    reordered.push(params[idx]);
    return "?";
  });

  s = s
    .replace(/serial primary key/gi, "integer primary key autoincrement")
    .replace(/timestamptz/gi, "text")
    .replace(/now\(\)/gi, "datetime('now')")
    .replace(/bytea/gi, "blob")
    .replace(/::int/gi, "")
    .replace(/to_char\(created_at\s+at\s+time\s+zone\s+'[^']+',\s*'YYYY-MM-DD'\)/gi, "strftime('%Y-%m-%d', created_at)")
    .replace(/created_at\s*>\s*now\(\)\s*-\s*interval\s*'(\d+)\s*days'/gi, "created_at > datetime('now', '-$1 days')")
    .replace(/least\(([^,]+),\s*([^)]+)\)/gi, "min($1, $2)")
    .replace(/greatest\(([^,]+),\s*([^)]+)\)/gi, "max($1, $2)");

  return { sql: s, params: reordered };
}

export const isSqliteDb = () => isSqlite;

export const q = async (text, params = []) => {
  if (!initialized) {
    await initDb();
  }

  if (isSqlite) {
    const { sql: sSql, params: sParams } = pgToSqlite(text, params);
    const db = getSqliteDb();
    const isSelectOrReturning = /^\s*(select|with)/i.test(sSql) || /returning/i.test(sSql);
    const stmt = db.prepare(sSql);
    if (isSelectOrReturning) {
      return stmt.all(...sParams);
    } else {
      const res = stmt.run(...sParams);
      return [{ ...res, id: res.lastInsertRowid }];
    }
  } else {
    return (await pgPool.query(text, params)).rows;
  }
};

export const one = async (text, params = []) => (await q(text, params))[0] || null;

export async function initDb() {
  if (initialized) return;

  const forceSqlite = config.useSqlite || config.databaseUrl.startsWith("sqlite:");
  if (!forceSqlite) {
    try {
      const local = /localhost|127\.0\.0\.1/.test(config.databaseUrl);
      const testPool = new pg.Pool({
        connectionString: config.databaseUrl,
        ssl: local ? false : { rejectUnauthorized: false },
        connectionTimeoutMillis: 1500,
      });
      await testPool.query("SELECT 1");
      pgPool = testPool;
      isSqlite = false;
      console.log("Connected to PostgreSQL database");
    } catch (err) {
      console.warn("PostgreSQL not available (" + err.message + "), falling back to local SQLite database.");
      isSqlite = true;
    }
  } else {
    isSqlite = true;
  }

  if (isSqlite) {
    const db = getSqliteDb();
    db.exec(`
      create table if not exists users (
        id integer primary key autoincrement,
        phone text unique not null,
        name text not null default '',
        role text not null default 'seller',
        page_name text not null default '',
        page_url text not null default '',
        seller_trust int not null default 70,
        buyer_trust int not null default 60,
        is_suspended int not null default 0,
        created_at text not null default (datetime('now'))
      );

      create table if not exists buyer_stats (
        phone text primary key,
        delivered int not null default 0,
        refused int not null default 0,
        disputes int not null default 0,
        refunded int not null default 0,
        trust_score int not null default 60
      );

      create table if not exists seller_stats (
        user_id int primary key,
        completed int not null default 0,
        refused int not null default 0,
        disputes int not null default 0,
        refunded int not null default 0,
        trust_score int not null default 70
      );

      create table if not exists deals (
        id integer primary key autoincrement,
        code text unique not null,
        deal_type text not null default 'product',
        seller_id int not null,
        buyer_phone text not null,
        buyer_name text not null,
        address text not null,
        area text not null default 'Dhaka',
        product text not null,
        details text not null default '',
        price int not null,
        delivery_charge int not null default 0,
        total_amount int not null default 0,
        fee_amount int not null default 0,
        seller_payout int not null default 0,
        deposit int not null default 0,
        return_policy text not null default 'buyer_pays',
        return_charge int not null default 0,
        status text not null default 'created',
        outcome text not null default '',
        courier_name text not null default 'Steadfast',
        tracking_id text not null default '',
        courier_status text not null default '',
        return_courier_name text not null default '',
        return_tracking_id text not null default '',
        return_courier_status text not null default '',
        seller_confirmed int not null default 0,
        buyer_confirmed int not null default 0,
        risk_score int not null default 0,
        risk_reasons text not null default '',
        buyer_trust int not null default 60,
        ship_by text,
        confirm_by text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      );

      create index if not exists deals_buyer_idx on deals(buyer_phone);
      create index if not exists deals_seller_idx on deals(seller_id);

      create table if not exists deal_events (
        id integer primary key autoincrement,
        deal_id int not null,
        kind text not null,
        note text not null default '',
        created_at text not null default (datetime('now'))
      );

      create table if not exists disputes (
        id integer primary key autoincrement,
        deal_id int not null,
        raised_by_phone text not null default '',
        reason text not null,
        category text not null default '',
        evidence_text text not null default '',
        photo blob,
        photo_type text not null default '',
        ai_summary text not null default '',
        ai_recommendation text not null default 'review',
        admin_notes text not null default '',
        status text not null default 'open',
        created_at text not null default (datetime('now'))
      );

      create table if not exists ledger (
        id integer primary key autoincrement,
        deal_id int,
        transaction_type text not null,
        amount int not null,
        party_phone text not null default '',
        balance_after int not null default 0,
        notes text not null default '',
        created_at text not null default (datetime('now'))
      );

      create table if not exists notifications (
        id integer primary key autoincrement,
        phone text not null,
        title text not null default 'PakkaDeal Update',
        message text not null,
        deal_code text not null default '',
        is_read int not null default 0,
        created_at text not null default (datetime('now'))
      );

      create table if not exists settings (
        key text primary key,
        value text not null,
        description text not null default ''
      );
    `);
  } else {
    await pgPool.query(`
      create table if not exists users (
        id serial primary key,
        phone text unique not null,
        name text not null default '',
        role text not null default 'seller',
        page_name text not null default '',
        page_url text not null default '',
        seller_trust int not null default 70,
        buyer_trust int not null default 60,
        is_suspended int not null default 0,
        created_at timestamptz not null default now()
      );

      create table if not exists buyer_stats (
        phone text primary key,
        delivered int not null default 0,
        refused int not null default 0,
        disputes int not null default 0,
        refunded int not null default 0,
        trust_score int not null default 60
      );

      create table if not exists seller_stats (
        user_id int primary key,
        completed int not null default 0,
        refused int not null default 0,
        disputes int not null default 0,
        refunded int not null default 0,
        trust_score int not null default 70
      );

      create table if not exists deals (
        id serial primary key,
        code text unique not null,
        deal_type text not null default 'product',
        seller_id int not null references users(id),
        buyer_phone text not null,
        buyer_name text not null,
        address text not null,
        area text not null default 'Dhaka',
        product text not null,
        details text not null default '',
        price int not null,
        delivery_charge int not null default 0,
        total_amount int not null default 0,
        fee_amount int not null default 0,
        seller_payout int not null default 0,
        deposit int not null default 0,
        return_policy text not null default 'buyer_pays',
        return_charge int not null default 0,
        status text not null default 'created',
        outcome text not null default '',
        courier_name text not null default 'Steadfast',
        tracking_id text not null default '',
        courier_status text not null default '',
        return_courier_name text not null default '',
        return_tracking_id text not null default '',
        return_courier_status text not null default '',
        seller_confirmed int not null default 0,
        buyer_confirmed int not null default 0,
        risk_score int not null default 0,
        risk_reasons text not null default '',
        buyer_trust int not null default 60,
        ship_by timestamptz,
        confirm_by timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists deals_buyer_idx on deals(buyer_phone);
      create index if not exists deals_seller_idx on deals(seller_id);

      create table if not exists deal_events (
        id serial primary key,
        deal_id int not null references deals(id),
        kind text not null,
        note text not null default '',
        created_at timestamptz not null default now()
      );

      create table if not exists disputes (
        id serial primary key,
        deal_id int not null references deals(id),
        raised_by_phone text not null default '',
        reason text not null,
        category text not null default '',
        evidence_text text not null default '',
        photo bytea,
        photo_type text not null default '',
        ai_summary text not null default '',
        ai_recommendation text not null default 'review',
        admin_notes text not null default '',
        status text not null default 'open',
        created_at timestamptz not null default now()
      );

      create table if not exists ledger (
        id serial primary key,
        deal_id int references deals(id),
        transaction_type text not null,
        amount int not null,
        party_phone text not null default '',
        balance_after int not null default 0,
        notes text not null default '',
        created_at timestamptz not null default now()
      );

      create table if not exists notifications (
        id serial primary key,
        phone text not null,
        title text not null default 'PakkaDeal Update',
        message text not null,
        deal_code text not null default '',
        is_read int not null default 0,
        created_at timestamptz not null default now()
      );

      create table if not exists settings (
        key text primary key,
        value text not null,
        description text not null default ''
      );
    `);
  }

  initialized = true;

  // Run comprehensive database migrations for existing installations
  await runMigrations();

  await seedInitialData();
}

async function runMigrations() {
  try {
    if (isSqlite) {
      const db = getSqliteDb();
      const dealCols = db.prepare("pragma table_info(deals)").all().map(c => c.name);
      const neededDealCols = [
        ["deal_type", "text not null default 'product'"],
        ["details", "text not null default ''"],
        ["delivery_charge", "int not null default 0"],
        ["total_amount", "int not null default 0"],
        ["fee_amount", "int not null default 0"],
        ["seller_payout", "int not null default 0"],
        ["deposit", "int not null default 0"],
        ["return_policy", "text not null default 'buyer_pays'"],
        ["return_charge", "int not null default 0"],
        ["outcome", "text not null default ''"],
        ["courier_name", "text not null default 'Steadfast'"],
        ["tracking_id", "text not null default ''"],
        ["courier_status", "text not null default ''"],
        ["return_courier_name", "text not null default ''"],
        ["return_tracking_id", "text not null default ''"],
        ["return_courier_status", "text not null default ''"],
        ["seller_confirmed", "int not null default 0"],
        ["buyer_confirmed", "int not null default 0"],
        ["risk_score", "int not null default 0"],
        ["risk_reasons", "text not null default ''"],
        ["buyer_trust", "int not null default 60"],
        ["ship_by", "text"],
        ["confirm_by", "text"],
        ["payment_method", "text not null default 'bKash'"],
        ["payment_sender", "text not null default ''"],
        ["payment_trx_id", "text not null default ''"],
      ];
      for (const [col, colType] of neededDealCols) {
        if (!dealCols.includes(col)) {
          db.exec(`alter table deals add column ${col} ${colType}`);
        }
      }

      const userCols = db.prepare("pragma table_info(users)").all().map(c => c.name);
      const neededUserCols = [
        ["page_name", "text not null default ''"],
        ["page_url", "text not null default ''"],
        ["seller_trust", "int not null default 70"],
        ["buyer_trust", "int not null default 60"],
        ["is_suspended", "int not null default 0"],
      ];
      for (const [col, colType] of neededUserCols) {
        if (!userCols.includes(col)) {
          db.exec(`alter table users add column ${col} ${colType}`);
        }
      }

      const disputeCols = db.prepare("pragma table_info(disputes)").all().map(c => c.name);
      const neededDisputeCols = [
        ["raised_by_phone", "text not null default ''"],
        ["category", "text not null default ''"],
        ["evidence_text", "text not null default ''"],
        ["photo_type", "text not null default ''"],
        ["ai_summary", "text not null default ''"],
        ["ai_recommendation", "text not null default 'review'"],
        ["admin_notes", "text not null default ''"],
      ];
      for (const [col, colType] of neededDisputeCols) {
        if (!disputeCols.includes(col)) {
          db.exec(`alter table disputes add column ${col} ${colType}`);
        }
      }

      db.exec(`update deals set seller_payout = max(total_amount - fee_amount, 0) where (seller_payout is null or seller_payout = 0) and total_amount > 0`);
    } else if (pgPool) {
      const neededDealCols = [
        ["deal_type", "text not null default 'product'"],
        ["details", "text not null default ''"],
        ["delivery_charge", "int not null default 0"],
        ["total_amount", "int not null default 0"],
        ["fee_amount", "int not null default 0"],
        ["seller_payout", "int not null default 0"],
        ["deposit", "int not null default 0"],
        ["return_policy", "text not null default 'buyer_pays'"],
        ["return_charge", "int not null default 0"],
        ["outcome", "text not null default ''"],
        ["courier_name", "text not null default 'Steadfast'"],
        ["tracking_id", "text not null default ''"],
        ["courier_status", "text not null default ''"],
        ["return_courier_name", "text not null default ''"],
        ["return_tracking_id", "text not null default ''"],
        ["return_courier_status", "text not null default ''"],
        ["seller_confirmed", "int not null default 0"],
        ["buyer_confirmed", "int not null default 0"],
        ["risk_score", "int not null default 0"],
        ["risk_reasons", "text not null default ''"],
        ["buyer_trust", "int not null default 60"],
        ["ship_by", "timestamptz"],
        ["confirm_by", "timestamptz"],
        ["payment_method", "text not null default 'bKash'"],
        ["payment_sender", "text not null default ''"],
        ["payment_trx_id", "text not null default ''"],
      ];
      for (const [col, colType] of neededDealCols) {
        await pgPool.query(`alter table deals add column if not exists ${col} ${colType}`);
      }

      const neededUserCols = [
        ["page_name", "text not null default ''"],
        ["page_url", "text not null default ''"],
        ["seller_trust", "int not null default 70"],
        ["buyer_trust", "int not null default 60"],
        ["is_suspended", "int not null default 0"],
      ];
      for (const [col, colType] of neededUserCols) {
        await pgPool.query(`alter table users add column if not exists ${col} ${colType}`);
      }

      const neededDisputeCols = [
        ["raised_by_phone", "text not null default ''"],
        ["category", "text not null default ''"],
        ["evidence_text", "text not null default ''"],
        ["photo_type", "text not null default ''"],
        ["ai_summary", "text not null default ''"],
        ["ai_recommendation", "text not null default 'review'"],
        ["admin_notes", "text not null default ''"],
      ];
      for (const [col, colType] of neededDisputeCols) {
        await pgPool.query(`alter table disputes add column if not exists ${col} ${colType}`);
      }

      await pgPool.query(`update deals set seller_payout = greatest(total_amount - fee_amount, 0) where (seller_payout is null or seller_payout = 0) and total_amount > 0`);
    }
  } catch (migErr) {
    console.warn("Migration warning:", migErr.message);
  }
}

async function seedInitialData() {
  const existingSettings = await one("select count(*) as cnt from settings");
  const count = Number(existingSettings?.cnt || 0);
  if (count === 0) {
    const defaultSettings = [
      ["platform_fee_percent", "2", "Escrow service fee percentage deducted from seller payout"],
      ["platform_fee_min", "10", "Minimum platform service fee in BDT"],
      ["confirm_window_hours", "72", "Buyer confirmation window after delivery/handover before auto-release"],
      ["ship_within_hours", "48", "Seller shipping window before automatic full buyer refund"],
      ["return_deduct_shipping", "true", "Whether buyer or seller pays return fee according to deal policy"],
    ];
    for (const [key, val, desc] of defaultSettings) {
      await q("insert into settings(key, value, description) values($1, $2, $3)", [key, val, desc]);
    }
  }

  // Ensure official escrow payment merchant settings exist
  const merchantSettings = [
    ["escrow_bkash_merchant", "01711-000000", "PakkaDeal Official bKash Escrow Merchant / Payment Number"],
    ["escrow_nagad_merchant", "01911-000000", "PakkaDeal Official Nagad Escrow Merchant / Payment Number"],
    ["escrow_rocket_merchant", "01811-000000", "PakkaDeal Official Rocket / Upay Number"],
    ["escrow_bank_name", "City Bank Ltd (Gulshan Branch)", "Official Escrow Bank Partner Name"],
    ["escrow_bank_account", "PakkaDeal Escrow Services Ltd (A/C: 150239482001)", "Escrow Bank Account & Holder Details"],
    ["escrow_payment_instructions", "বিকাশ বা নগদ অ্যাপের 'Make Payment' অপশন থেকে পাক্কাডিল অফিসিয়াল এসক্রো মার্চেন্ট নাম্বারে সম্পূর্ণ টাকা পেমেন্ট করুন। এরপর প্রাপ্ত Transaction ID (TrxID) এবং আপনার প্রেরক নম্বর নিচে বসিয়ে কনফার্ম করুন। টাকা সরাসরি পাক্কা ডিল এসক্রো ভল্টে সুরক্ষিত থাকবে।", "Official instructions shown to buyers during escrow checkout"],
  ];
  for (const [key, val, desc] of merchantSettings) {
    const existing = await one("select key from settings where key=$1", [key]);
    if (!existing) {
      await q("insert into settings(key, value, description) values($1, $2, $3)", [key, val, desc]);
    }
  }

  const userCount = Number((await one("select count(*) as cnt from users"))?.cnt || 0);
  if (userCount === 0) {
    console.log("Seeding initial PakkaDeal demo data...");
    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01700000000', 'PakkaDeal Admin', 'seller', 'PakkaDeal Official Support', 'https://facebook.com/pakkadeal', 100, 100)`);

    const s1 = await one(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01711223344', 'Rahim Chowdhury', 'seller', 'Gadget Corner BD', 'https://facebook.com/gadgetcornerbd', 95, 80) returning id`);

    const s2 = await one(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01811223344', 'Tanvir Ahmed', 'seller', 'Dhaka Fashion Hub', 'https://facebook.com/dhakafashion', 82, 70) returning id`);

    const s3 = await one(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01911223344', 'Kamal Hossain (Landlord)', 'seller', 'Dhanmondi Rentals & Studio', 'https://facebook.com/dhanmondirentals', 90, 85) returning id`);

    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01755667788', 'Nusrat Jahan', 'buyer', '', '', 70, 92)`);

    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01655667788', 'Arifur Rahman', 'buyer', '', '', 60, 65)`);

    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01955667788', 'Farhan Kabir', 'buyer', '', '', 65, 75)`);

    await q(`insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values('01755667788', 12, 0, 0, 92)`);
    await q(`insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values('01655667788', 2, 1, 0, 65)`);
    await q(`insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values('01955667788', 4, 1, 1, 75)`);

    const d1 = await one(`
      insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust, ship_by)
      values('PK-PROD-01', 'product', $1, '01755667788', 'Nusrat Jahan', 'House 14, Road 5, Dhanmondi, Dhaka', 'Dhaka',
        'Sony WH-1000XM5 Wireless Headphones (Midnight Blue)', 'Original brand new sealed with warranty card',
        32000, 120, 32120, 642, 31478, 32120, 'buyer_pays', 120,
        'shipped', 'Steadfast', 'ST-889021', 'in_transit', 12, 'Verified high-trust buyer', 92,
        datetime('now', '+2 days')) returning id
    `, [s1.id]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created by seller Rahim Chowdhury')`, [d1.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer deposited 32,120 BDT via bKash Escrow')`, [d1.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Seller dispatched via Steadfast Courier (Tracking: ST-889021)')`, [d1.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'courier_update', 'Steadfast: Parcel in transit to Dhanmondi Hub')`, [d1.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', 32120, '01755667788', 32120, 'Escrow hold for Sony WH-1000XM5')`, [d1.id]);

    const d2 = await one(`
      insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust, confirm_by)
      values('PK-PROD-02', 'product', $1, '01655667788', 'Arifur Rahman', 'Block C, House 22, Kandirpar, Cumilla', 'Cumilla',
        'Mechanical Gaming Keyboard (Cherry MX Red)', 'RGB Hot-swappable keyboard with extra keycaps',
        4500, 100, 4600, 92, 4508, 4600, 'seller_pays', 100,
        'delivered', 'Pathao', 'PT-99321', 'delivered', 24, 'Delivery to outside Dhaka', 65,
        datetime('now', '+3 days')) returning id
    `, [s1.id]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created')`, [d2.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer deposited 4,600 BDT into escrow')`, [d2.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Shipped via Pathao Courier (PT-99321)')`, [d2.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'delivered', 'Pathao confirmed delivered to buyer. 3-day verification window started.')`, [d2.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', 4600, '01655667788', 4600, 'Escrow deposit for Mechanical Keyboard')`, [d2.id]);

    const d3 = await one(`
      insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust)
      values('PK-PROD-03', 'product', $1, '01955667788', 'Farhan Kabir', 'Sector 7, Road 12, Uttara, Dhaka', 'Dhaka',
        'Samsung Galaxy Watch 6 (Graphite 44mm)', 'Brand new unopened Bluetooth smartwatch',
        24000, 100, 24100, 482, 23618, 24100, 'buyer_pays', 100,
        'disputed', 'Steadfast', 'ST-771234', 'delivered', 18, 'Standard order', 75) returning id
    `, [s1.id]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer paid 24,100 BDT into escrow')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Shipped with tracking ST-771234')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'delivered', 'Delivered by courier')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'disputed', 'Buyer filed dispute: Screen cracked upon opening parcel')`, [d3.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', 24100, '01955667788', 24100, 'Escrow deposit for Galaxy Watch 6')`, [d3.id]);

    await q(`
      insert into disputes(deal_id, raised_by_phone, reason, category, evidence_text, ai_summary, ai_recommendation, status)
      values($1, '01955667788', 'Screen cracked upon opening parcel. Looks like impact during courier transit.',
        'damaged', 'Unboxing photo shows front glass shattered while original box seal was tampered.',
        'AI Analysis: Image indicates deep crack lines on watch face matching transit impact or drop damage. Matches claimed damaged condition.',
        'uphold', 'open')
    `, [d3.id]);

    const d4 = await one(`
      insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status,
        seller_confirmed, buyer_confirmed, risk_score, risk_reasons, buyer_trust)
      values('PK-RENT-01', 'rental', $1, '01755667788', 'Nusrat Jahan', 'Flat 4B, Road 9/A, Dhanmondi, Dhaka', 'Dhaka',
        '2-Month Studio Apartment Security Deposit & Booking', 'Furnished bachelor studio. Terms: 30-day notice period, key handover upon inspection.',
        40000, 0, 40000, 800, 39200, 40000, 'held',
        0, 0, 10, 'High value rental deal; requires dual party verification', 92) returning id
    `, [s3.id]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Rental agreement terms created by Landlord Kamal Hossain')`, [d4.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Tenant Nusrat Jahan deposited 40,000 BDT into escrow. Funds secured until key handover.')`, [d4.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', 40000, '01755667788', 40000, 'Rental escrow deposit for Flat 4B Dhanmondi')`, [d4.id]);

    const d5 = await one(`
      insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status, outcome,
        seller_confirmed, buyer_confirmed, risk_score, risk_reasons, buyer_trust)
      values('PK-SERV-01', 'service', $1, '01655667788', 'Arifur Rahman', 'Gulshan-2, Dhaka', 'Dhaka',
        'Next.js E-Commerce Frontend Integration Milestone', 'Complete responsive UI implementation, payment gateway integration and deployment to Vercel.',
        15000, 0, 15000, 300, 14700, 15000, 'released', 'both_confirmed',
        1, 1, 15, 'Service contract', 65) returning id
    `, [s2.id]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Milestone agreement established')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Client funded 15,000 BDT to escrow')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'completed_freelancer', 'Freelancer submitted deliverable code repository')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'completed_client', 'Client reviewed code and confirmed satisfactory handover')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'released', 'Funds released: 14,700 BDT paid to seller, 300 BDT platform fee collected')`, [d5.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', 15000, '01655667788', 15000, 'Milestone escrow hold')`, [d5.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'payout_seller', 14700, '01811223344', 300, 'Payout to Freelancer Tanvir Ahmed')`, [d5.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'platform_fee', 300, 'system', 0, '2% platform fee for PK-SERV-01')`, [d5.id]);

    const d6 = await one(`
      insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, risk_score, risk_reasons, buyer_trust)
      values('PK-PROD-04', 'product', $1, '01755667788', 'Nusrat Jahan', 'Mirpur 10, Dhaka', 'Dhaka',
        'Pure Cotton Silk Jamdani Saree (Sky Blue)', 'Handcrafted authentic Jamdani saree with matching blouse piece',
        8500, 100, 8600, 172, 8428, 8600, 'buyer_pays', 100,
        'created', 8, 'Low risk', 92) returning id
    `, [s2.id]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created by seller Tanvir Ahmed. Waiting for buyer escrow payment.')`, [d6.id]);

    await q(`insert into notifications(phone, title, message, deal_code)
      values('01755667788', 'Deal Ready for Payment', 'Gadget Corner BD created deal PK-PROD-01. Please deposit into escrow to secure your order.', 'PK-PROD-01')`);
    await q(`insert into notifications(phone, title, message, deal_code)
      values('01655667788', 'Parcel Delivered', 'Your order PK-PROD-02 has been delivered by Pathao Courier. Please inspect and confirm receipt within 72 hours.', 'PK-PROD-02')`);
    await q(`insert into notifications(phone, title, message, deal_code)
      values('01700000000', 'New Dispute Filed', 'Buyer Farhan Kabir filed a dispute on deal PK-PROD-03 (Damaged product). Review required.', 'PK-PROD-03')`);

    console.log("Seeding completed successfully.");
  }
}
