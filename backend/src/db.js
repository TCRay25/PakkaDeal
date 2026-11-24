import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { computeAmounts } from "./services/amounts.js";

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
  sqliteDb.exec("PRAGMA busy_timeout = 5000;");
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

const txStorage = new AsyncLocalStorage();
let sqliteTxMutex = Promise.resolve();

export function generatePublicId() {
  return "usr_" + randomBytes(8).toString("hex");
}

export const isSqliteDb = () => isSqlite;

export const transaction = async (fn) => {
  if (!initialized) {
    await initDb();
  }

  const currentStore = txStorage.getStore();
  if (currentStore) {
    // Re-use current active transaction
    return await fn();
  }

  if (isSqlite) {
    const prevMutex = sqliteTxMutex;
    let releaseMutex;
    sqliteTxMutex = new Promise((resolve) => {
      releaseMutex = resolve;
    });
    await prevMutex;
    const db = getSqliteDb();
    try {
      db.exec("BEGIN IMMEDIATE;");
      try {
        const result = await txStorage.run({ isSqlite: true, db }, async () => {
          return await fn();
        });
        db.exec("COMMIT;");
        return result;
      } catch (err) {
        try {
          db.exec("ROLLBACK;");
        } catch (_rb) {}
        throw err;
      }
    } finally {
      releaseMutex();
    }
  } else {
    const client = await pgPool.connect();
    try {
      await client.query("BEGIN;");
      const result = await txStorage.run({ isSqlite: false, client }, async () => {
        return await fn();
      });
      await client.query("COMMIT;");
      return result;
    } catch (err) {
      try {
        await client.query("ROLLBACK;");
      } catch (_rbErr) {}
      throw err;
    } finally {
      client.release();
    }
  }
};

export const q = async (text, params = []) => {
  if (!initialized) {
    await initDb();
  }

  const txStore = txStorage.getStore();

  if (isSqlite) {
    const { sql: sSql, params: sParams } = pgToSqlite(text, params);
    const db = getSqliteDb();
    const isSelectOrReturning = /^\s*(select|with)/i.test(sSql) || /returning/i.test(sSql);
    const stmt = db.prepare(sSql);
    if (isSelectOrReturning) {
      const rows = stmt.all(...sParams);
      rows.rowCount = rows.length;
      return rows;
    } else {
      const res = stmt.run(...sParams);
      const rows = [{ ...res, id: res.lastInsertRowid }];
      rows.rowCount = res.changes;
      return rows;
    }
  } else {
    const pgSql = text
      .replace(/datetime\('now'\)/gi, "now()")
      .replace(/datetime\('now',\s*'-(\d+)\s*(minutes|hours|days)'\)/gi, "now() - interval '$1 $2'")
      .replace(/datetime\('now',\s*'\+(\d+)\s*(minutes|hours|days)'\)/gi, "now() + interval '$1 $2'");
    
    const res = (txStore && !txStore.isSqlite && txStore.client)
      ? await txStore.client.query(pgSql, params)
      : await pgPool.query(pgSql, params);
    const rows = res.rows;
    rows.rowCount = res.rowCount;
    return rows;
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
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 30000,
        keepAlive: true,
      });
      testPool.on("error", (err) => {
        console.warn("[PostgreSQL Pool Error]", err.message);
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
        public_id text unique,
        phone text unique not null,
        uid text not null default '',
        name text not null default '',
        email text not null default '',
        bkash_number text not null default '',
        bkash_type text not null default 'Personal',
        bkash_verified int not null default 0,
        role text not null default 'seller',
        page_name text not null default '',
        page_url text not null default '',
        seller_trust int not null default 70,
        buyer_trust int not null default 60,
        is_suspended int not null default 0,
        token_version int not null default 1,
        created_at text not null default (datetime('now'))
      );

      create trigger if not exists users_auto_public_id
      after insert on users
      for each row
      when new.public_id is null or new.public_id = ''
      begin
        update users set public_id = 'usr_' || lower(hex(randomblob(8))) where id = new.id;
      end;

      create table if not exists otps (
        phone text primary key,
        code text not null,
        email text not null default '',
        expires_at text not null,
        attempts int not null default 0,
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
        payment_mode text not null default 'delivery_only',
        cod_amount int not null default 0,
        seller_id int not null,
        buyer_id int,
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
        fee_percent real not null default 2,
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
        payment_method text not null default 'bKash',
        payment_sender text not null default '',
        payment_trx_id text not null default '',
        payment_amount int not null default 0,
        payment_status text not null default 'none',
        payment_submitted_at timestamptz,
        payment_rejection_reason text not null default '',
        payout_status text not null default 'none',
        payout_trx_id text not null default '',
        payout_at timestamptz,
        return_seller_trx_id text not null default '',
        return_seller_paid_at timestamptz,
        return_buyer_trx_id text not null default '',
        return_buyer_paid_at timestamptz,
        payment_amount int not null default 0,
        payment_status text not null default 'none',
        payment_submitted_at text,
        payment_rejection_reason text not null default '',
        payout_status text not null default 'none',
        payout_trx_id text not null default '',
        payout_at text,
        return_seller_trx_id text not null default '',
        return_seller_paid_at text,
        return_buyer_trx_id text not null default '',
        return_buyer_paid_at text,
        created_at text not null default (datetime('now')),
        updated_at text not null default (datetime('now'))
      );

      create index if not exists deals_buyer_idx on deals(buyer_phone);
      create index if not exists deals_seller_idx on deals(seller_id);

      create table if not exists deal_events (
        id integer primary key autoincrement,
        deal_id int not null,
        kind text not null default '',
        from_status text not null default '',
        to_status text not null default '',
        actor text not null default 'system',
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

      delete from ledger
      where transaction_type in ('payout_seller', 'refund_buyer', 'platform_fee')
        and id not in (
          select min(id)
          from ledger
          where transaction_type in ('payout_seller', 'refund_buyer', 'platform_fee')
          group by deal_id, transaction_type
        );

      create unique index if not exists ledger_deal_tx_unique
      on ledger(deal_id, transaction_type)
      where transaction_type in ('payout_seller', 'refund_buyer', 'platform_fee');

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

      create table if not exists tracking_events (
        id integer primary key autoincrement,
        deal_id int not null,
        tracking_id text not null default '',
        courier text not null default '',
        standardized_status text not null,
        original_status text not null default '',
        location text not null default '',
        note text not null default '',
        occurred_at text not null default (datetime('now')),
        created_at text not null default (datetime('now'))
      );
      create index if not exists tracking_events_deal_idx on tracking_events(deal_id);
    `);
  } else {
    // Ensure PostgreSQL supports datetime('now') and datetime('now', '-15 minutes') as fallback
    try {
      await pgPool.query(`
        CREATE OR REPLACE FUNCTION datetime(timestr text) RETURNS timestamptz AS $$
        BEGIN
          IF timestr = 'now' THEN
            RETURN now();
          ELSE
            RETURN timestr::timestamptz;
          END IF;
        END;
        $$ LANGUAGE plpgsql;

        CREATE OR REPLACE FUNCTION datetime(timestr text, modifier text) RETURNS timestamptz AS $$
        DECLARE
          base_time timestamptz;
          mod_str text;
        BEGIN
          IF timestr = 'now' THEN
            base_time := now();
          ELSE
            base_time := timestr::timestamptz;
          END IF;
          mod_str := trim(replace(modifier, '+', ''));
          IF mod_str LIKE '-%' THEN
            RETURN base_time - substring(mod_str from 2)::interval;
          ELSE
            RETURN base_time + mod_str::interval;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RETURN base_time;
        END;
        $$ LANGUAGE plpgsql;
      `);
    } catch (_compatErr) {}

    await pgPool.query(`
      create table if not exists users (
        id serial primary key,
        public_id text unique,
        phone text unique not null,
        uid text not null default '',
        name text not null default '',
        email text not null default '',
        bkash_number text not null default '',
        bkash_type text not null default 'Personal',
        bkash_verified int not null default 0,
        role text not null default 'seller',
        page_name text not null default '',
        page_url text not null default '',
        seller_trust int not null default 70,
        buyer_trust int not null default 60,
        is_suspended int not null default 0,
        token_version int not null default 1,
        created_at timestamptz not null default now()
      );

      create table if not exists otps (
        phone text primary key,
        code text not null,
        email text not null default '',
        expires_at timestamptz not null,
        attempts int not null default 0,
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
        payment_mode text not null default 'delivery_only',
        cod_amount int not null default 0,
        seller_id int not null references users(id),
        buyer_id int,
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
        fee_percent real not null default 2,
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
        payment_method text not null default 'bKash',
        payment_sender text not null default '',
        payment_trx_id text not null default '',
        payment_amount int not null default 0,
        payment_status text not null default 'none',
        payment_submitted_at timestamptz,
        payment_rejection_reason text not null default '',
        payout_status text not null default 'none',
        payout_trx_id text not null default '',
        payout_at timestamptz,
        return_seller_trx_id text not null default '',
        return_seller_paid_at timestamptz,
        return_buyer_trx_id text not null default '',
        return_buyer_paid_at timestamptz,
        is_manual_courier int not null default 0,
        courier_phone text not null default '',
        consignment_slip bytea,
        consignment_slip_type text not null default '',
        manual_audit_status text not null default 'none',
        auto_release_at timestamptz,
        auto_release_paused int not null default 0,
        unboxing_photo bytea,
        unboxing_photo_type text not null default '',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists deals_buyer_idx on deals(buyer_phone);
      create index if not exists deals_seller_idx on deals(seller_id);

      create table if not exists deal_events (
        id serial primary key,
        deal_id int not null references deals(id),
        kind text not null default '',
        from_status text not null default '',
        to_status text not null default '',
        actor text not null default 'system',
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

      delete from ledger
      where transaction_type in ('payout_seller', 'refund_buyer', 'platform_fee')
        and id not in (
          select min(id)
          from ledger
          where transaction_type in ('payout_seller', 'refund_buyer', 'platform_fee')
          group by deal_id, transaction_type
        );

      create unique index if not exists ledger_deal_tx_unique
      on ledger(deal_id, transaction_type)
      where transaction_type in ('payout_seller', 'refund_buyer', 'platform_fee');

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

      create table if not exists tracking_events (
        id serial primary key,
        deal_id int not null references deals(id),
        tracking_id text not null default '',
        courier text not null default '',
        standardized_status text not null,
        original_status text not null default '',
        location text not null default '',
        note text not null default '',
        occurred_at timestamptz not null default now(),
        created_at timestamptz not null default now()
      );
      create index if not exists tracking_events_deal_idx on tracking_events(deal_id);
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
        ["payment_mode", "text not null default 'delivery_only'"],
        ["cod_amount", "int not null default 0"],
        ["details", "text not null default ''"],
        ["delivery_charge", "int not null default 0"],
        ["total_amount", "int not null default 0"],
        ["fee_amount", "int not null default 0"],
        ["fee_percent", "real not null default 2"],
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
        ["is_manual_courier", "int not null default 0"],
        ["courier_phone", "text not null default ''"],
        ["consignment_slip", "blob"],
        ["consignment_slip_type", "text not null default ''"],
        ["manual_audit_status", "text not null default 'none'"],
        ["auto_release_at", "text"],
        ["auto_release_paused", "int not null default 0"],
        ["unboxing_photo", "blob"],
        ["unboxing_photo_type", "text not null default ''"],
        ["detection_confidence", "int not null default 0"],
        ["tracking_source", "text not null default 'api'"],
        ["standardized_status", "text not null default ''"],
        ["raw_courier_status", "text not null default ''"],
        ["current_location", "text not null default ''"],
        ["estimated_delivery_at", "text"],
        ["last_tracking_update", "text"],
        ["last_polled_at", "text"],
        ["poll_failure_count", "int not null default 0"],
        ["created_at", "text not null default (datetime('now'))"],
        ["updated_at", "text not null default (datetime('now'))"],
        ["buyer_id", "int"],
        ["payment_amount", "int not null default 0"],
        ["payment_status", "text not null default 'none'"],
        ["payment_submitted_at", "text"],
        ["payment_rejection_reason", "text not null default ''"],
        ["payout_status", "text not null default 'none'"],
        ["payout_trx_id", "text not null default ''"],
        ["payout_at", "text"],
        ["return_seller_trx_id", "text not null default ''"],
        ["return_seller_paid_at", "text"],
        ["return_buyer_trx_id", "text not null default ''"],
        ["return_buyer_paid_at", "text"],
      ];
      for (const [col, colType] of neededDealCols) {
        if (!dealCols.includes(col)) {
          db.exec(`alter table deals add column ${col} ${colType}`);
        }
      }

      db.exec(`
        create table if not exists tracking_events (
          id integer primary key autoincrement,
          deal_id int not null,
          tracking_id text not null default '',
          courier text not null default '',
          standardized_status text not null,
          original_status text not null default '',
          location text not null default '',
          note text not null default '',
          occurred_at text not null default (datetime('now')),
          created_at text not null default (datetime('now'))
        );
        create index if not exists tracking_events_deal_idx on tracking_events(deal_id);
      `);

      const eventCols = db.prepare("pragma table_info(deal_events)").all().map(c => c.name);
      const neededEventCols = [
        ["from_status", "text not null default ''"],
        ["to_status", "text not null default ''"],
        ["actor", "text not null default 'system'"],
      ];
      for (const [col, colType] of neededEventCols) {
        if (!eventCols.includes(col)) {
          db.exec(`alter table deal_events add column ${col} ${colType}`);
        }
      }

      const userCols = db.prepare("pragma table_info(users)").all().map(c => c.name);
      const neededUserCols = [
        ["uid", "text not null default ''"],
        ["email", "text not null default ''"],
        ["bkash_number", "text not null default ''"],
        ["bkash_type", "text not null default 'Personal'"],
        ["bkash_verified", "int not null default 0"],
        ["page_name", "text not null default ''"],
        ["page_url", "text not null default ''"],
        ["seller_trust", "int not null default 70"],
        ["buyer_trust", "int not null default 60"],
        ["is_suspended", "int not null default 0"],
        ["token_version", "int not null default 1"],
        ["public_id", "text default ('usr_' || lower(hex(randomblob(8))))"],
      ];
      for (const [col, colType] of neededUserCols) {
        if (!userCols.includes(col)) {
          db.exec(`alter table users add column ${col} ${colType}`);
        }
      }
      db.exec(`
        create table if not exists otps (
          phone text primary key,
          code text not null,
          email text not null default '',
          expires_at text not null,
          attempts int not null default 0,
          created_at text not null default (datetime('now'))
        );
      `);

      const otpCols = db.prepare("pragma table_info(otps)").all().map(c => c.name);
      if (!otpCols.includes("attempts")) {
        db.exec("alter table otps add column attempts int not null default 0");
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

      const buyerCols = db.prepare("pragma table_info(buyer_stats)").all().map(c => c.name);
      if (!buyerCols.includes("refunded")) {
        db.exec("alter table buyer_stats add column refunded int not null default 0");
      }
      const sellerCols = db.prepare("pragma table_info(seller_stats)").all().map(c => c.name);
      if (!sellerCols.includes("refunded")) {
        db.exec("alter table seller_stats add column refunded int not null default 0");
      }

      const notifCols = db.prepare("pragma table_info(notifications)").all().map(c => c.name);
      if (!notifCols.includes("title")) {
        db.exec("alter table notifications add column title text not null default 'PakkaDeal Update'");
      }
      if (!notifCols.includes("deal_code")) {
        db.exec("alter table notifications add column deal_code text not null default ''");
      }
      if (!notifCols.includes("is_read")) {
        db.exec("alter table notifications add column is_read int not null default 0");
      }

      const ledgerCols = db.prepare("pragma table_info(ledger)").all().map(c => c.name);
      if (!ledgerCols.includes("party_phone")) {
        db.exec("alter table ledger add column party_phone text not null default ''");
      }
      if (!ledgerCols.includes("balance_after")) {
        db.exec("alter table ledger add column balance_after int not null default 0");
      }
      if (!ledgerCols.includes("notes")) {
        db.exec("alter table ledger add column notes text not null default ''");
      }

      db.exec(`update deals set seller_payout = max(total_amount - fee_amount, 0) where (seller_payout is null or seller_payout = 0) and total_amount > 0`);
      db.exec(`update deals set fee_percent = round(cast(fee_amount as real) * 100.0 / total_amount, 1) where total_amount > 0 and (fee_percent is null or fee_percent = 0)`);
      db.exec(`update deals set payment_mode = 'full_payment' where payment_mode is null or payment_mode = '' or (payment_mode = 'delivery_only' and cod_amount = 0)`);
      db.exec(`update settings set value='1' where key='platform_fee_percent' and value='2'`);
      db.exec(`update users set bkash_number=phone, bkash_type='Merchant', bkash_verified=1 where phone in ('01700000000', '01711223344', '01811223344', '01911223344') and (bkash_number is null or bkash_number='' or bkash_verified=0)`);
    } else if (pgPool) {
      const neededDealCols = [
        ["deal_type", "text not null default 'product'"],
        ["payment_mode", "text not null default 'delivery_only'"],
        ["cod_amount", "int not null default 0"],
        ["details", "text not null default ''"],
        ["delivery_charge", "int not null default 0"],
        ["total_amount", "int not null default 0"],
        ["fee_amount", "int not null default 0"],
        ["fee_percent", "real not null default 2"],
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
        ["is_manual_courier", "int not null default 0"],
        ["courier_phone", "text not null default ''"],
        ["consignment_slip", "bytea"],
        ["consignment_slip_type", "text not null default ''"],
        ["manual_audit_status", "text not null default 'none'"],
        ["auto_release_at", "timestamptz"],
        ["auto_release_paused", "int not null default 0"],
        ["unboxing_photo", "bytea"],
        ["unboxing_photo_type", "text not null default ''"],
        ["detection_confidence", "int not null default 0"],
        ["tracking_source", "text not null default 'api'"],
        ["standardized_status", "text not null default ''"],
        ["raw_courier_status", "text not null default ''"],
        ["current_location", "text not null default ''"],
        ["estimated_delivery_at", "timestamptz"],
        ["last_tracking_update", "timestamptz"],
        ["last_polled_at", "timestamptz"],
        ["poll_failure_count", "int not null default 0"],
        ["created_at", "timestamptz not null default now()"],
        ["updated_at", "timestamptz not null default now()"],
        ["buyer_id", "int"],
        ["payment_amount", "int not null default 0"],
        ["payment_status", "text not null default 'none'"],
        ["payment_submitted_at", "timestamptz"],
        ["payment_rejection_reason", "text not null default ''"],
        ["payout_status", "text not null default 'none'"],
        ["payout_trx_id", "text not null default ''"],
        ["payout_at", "timestamptz"],
        ["return_seller_trx_id", "text not null default ''"],
        ["return_seller_paid_at", "timestamptz"],
        ["return_buyer_trx_id", "text not null default ''"],
        ["return_buyer_paid_at", "timestamptz"],
      ];
      for (const [col, colType] of neededDealCols) {
        await pgPool.query(`alter table deals add column if not exists ${col} ${colType}`);
      }

      await pgPool.query(`alter table deals add column if not exists updated_at timestamptz not null default now()`);
      await pgPool.query(`alter table deals add column if not exists created_at timestamptz not null default now()`);
      await pgPool.query(`alter table deals add column if not exists buyer_id int`);

      await pgPool.query(`
        create table if not exists tracking_events (
          id serial primary key,
          deal_id int not null references deals(id),
          tracking_id text not null default '',
          courier text not null default '',
          standardized_status text not null,
          original_status text not null default '',
          location text not null default '',
          note text not null default '',
          occurred_at timestamptz not null default now(),
          created_at timestamptz not null default now()
        );
        create index if not exists tracking_events_deal_idx on tracking_events(deal_id);
      `);

      const neededEventCols = [
        ["from_status", "text not null default ''"],
        ["to_status", "text not null default ''"],
        ["actor", "text not null default 'system'"],
      ];
      for (const [col, colType] of neededEventCols) {
        await pgPool.query(`alter table deal_events add column if not exists ${col} ${colType}`);
      }

      const neededUserCols = [
        ["uid", "text not null default ''"],
        ["email", "text not null default ''"],
        ["bkash_number", "text not null default ''"],
        ["bkash_type", "text not null default 'Personal'"],
        ["bkash_verified", "int not null default 0"],
        ["page_name", "text not null default ''"],
        ["page_url", "text not null default ''"],
        ["seller_trust", "int not null default 70"],
        ["buyer_trust", "int not null default 60"],
        ["is_suspended", "int not null default 0"],
        ["token_version", "int not null default 1"],
        ["public_id", "text default ('usr_' || md5(random()::text || clock_timestamp()::text))"],
      ];
      for (const [col, colType] of neededUserCols) {
        await pgPool.query(`alter table users add column if not exists ${col} ${colType}`);
      }
      await pgPool.query(`
        create table if not exists otps (
          phone text primary key,
          code text not null,
          email text not null default '',
          expires_at timestamptz not null,
          attempts int not null default 0,
          created_at timestamptz not null default now()
        );
      `);
      await pgPool.query(`alter table otps add column if not exists attempts int not null default 0`);

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

      await pgPool.query(`alter table buyer_stats add column if not exists refunded int not null default 0`);
      await pgPool.query(`alter table buyer_stats add column if not exists disputes int not null default 0`);
      await pgPool.query(`alter table buyer_stats add column if not exists delivered int not null default 0`);
      await pgPool.query(`alter table buyer_stats add column if not exists refused int not null default 0`);
      await pgPool.query(`alter table buyer_stats add column if not exists trust_score int not null default 60`);

      await pgPool.query(`alter table seller_stats add column if not exists refunded int not null default 0`);
      await pgPool.query(`alter table seller_stats add column if not exists disputes int not null default 0`);
      await pgPool.query(`alter table seller_stats add column if not exists completed int not null default 0`);
      await pgPool.query(`alter table seller_stats add column if not exists refused int not null default 0`);
      await pgPool.query(`alter table seller_stats add column if not exists trust_score int not null default 70`);

      await pgPool.query(`alter table notifications add column if not exists title text not null default 'PakkaDeal Update'`);
      await pgPool.query(`alter table notifications add column if not exists deal_code text not null default ''`);
      await pgPool.query(`alter table notifications add column if not exists is_read int not null default 0`);

      await pgPool.query(`alter table ledger add column if not exists party_phone text not null default ''`);
      await pgPool.query(`alter table ledger add column if not exists balance_after int not null default 0`);
      await pgPool.query(`alter table ledger add column if not exists notes text not null default ''`);

      await pgPool.query(`update deals set seller_payout = greatest(total_amount - fee_amount, 0) where (seller_payout is null or seller_payout = 0) and total_amount > 0`);
      await pgPool.query(`update deals set fee_percent = round(cast(fee_amount as numeric) * 100.0 / nullif(total_amount, 0), 1) where total_amount > 0 and (fee_percent is null or fee_percent = 0)`);
      await pgPool.query(`update deals set payment_mode = 'full_payment' where payment_mode is null or payment_mode = '' or (payment_mode = 'delivery_only' and cod_amount = 0)`);
      await pgPool.query(`update settings set value='1' where key='platform_fee_percent' and value='2'`);
      await pgPool.query(`update users set bkash_number=phone, bkash_type='Merchant', bkash_verified=1 where phone in ('01700000000', '01711223344', '01811223344', '01911223344') and (bkash_number is null or bkash_number='' or bkash_verified=0)`);
    }

    // Ensure all users have a public_id populated
    const unpopulated = await q("select id from users where public_id is null or public_id = ''");
    for (const u of unpopulated) {
      await q("update users set public_id=$1 where id=$2", [generatePublicId(), u.id]);
    }

    if (isSqlite) {
      getSqliteDb().exec(`
        drop index if exists users_public_id_idx;
        create unique index if not exists users_public_id_idx on users(public_id) where public_id is not null and public_id != '';
        create trigger if not exists users_auto_public_id
        after insert on users
        for each row
        when new.public_id is null or new.public_id = ''
        begin
          update users set public_id = 'usr_' || lower(hex(randomblob(8))) where id = new.id;
        end;
      `);
    } else {
      await pgPool.query(`
        drop index if exists users_public_id_idx;
        create unique index if not exists users_public_id_idx on users(public_id) where public_id is not null and public_id != '';
      `);
    }
    const existingMinDeposit = await one("select key from settings where key='min_delivery_deposit'");
    if (!existingMinDeposit) {
      await q("insert into settings(key, value, description) values($1, $2, $3)", [
        "min_delivery_deposit",
        "60",
        "Minimum delivery deposit in BDT for delivery-only escrow",
      ]);
    }

    const existingRefusalHours = await one("select key from settings where key='refusal_review_hours'");
    if (!existingRefusalHours) {
      await q("insert into settings(key, value, description) values($1, $2, $3)", [
        "refusal_review_hours",
        "24",
        "Buyer review window in hours after delivery-only parcel refusal before shipping compensation is paid",
      ]);
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
      ["platform_fee_percent", "1", "Escrow service fee percentage added to buyer checkout"],
      ["platform_fee_min", "10", "Minimum platform service fee in BDT"],
      ["min_delivery_deposit", "60", "Minimum delivery deposit in BDT for delivery-only escrow"],
      ["refusal_review_hours", "24", "Buyer review window in hours after delivery-only parcel refusal before shipping compensation is paid"],
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
    await q(`insert into users(phone, name, role, page_name, page_url, bkash_number, bkash_type, bkash_verified, seller_trust, buyer_trust)
      values('01700000000', 'PakkaDeal Admin', 'seller', 'PakkaDeal Official Support', 'https://facebook.com/pakkadeal', '01700000000', 'Merchant', 1, 100, 100)`);

    const s1 = await one(`insert into users(phone, name, role, page_name, page_url, bkash_number, bkash_type, bkash_verified, seller_trust, buyer_trust)
      values('01711223344', 'Rahim Chowdhury', 'seller', 'Gadget Corner BD', 'https://facebook.com/gadgetcornerbd', '01711223344', 'Merchant', 1, 95, 80) returning id`);

    const s2 = await one(`insert into users(phone, name, role, page_name, page_url, bkash_number, bkash_type, bkash_verified, seller_trust, buyer_trust)
      values('01811223344', 'Tanvir Ahmed', 'seller', 'Dhaka Fashion Hub', 'https://facebook.com/dhakafashion', '01811223344', 'Personal', 1, 82, 70) returning id`);

    const s3 = await one(`insert into users(phone, name, role, page_name, page_url, bkash_number, bkash_type, bkash_verified, seller_trust, buyer_trust)
      values('01911223344', 'Kamal Hossain (Landlord)', 'seller', 'Dhanmondi Rentals & Studio', 'https://facebook.com/dhanmondirentals', '01911223344', 'Personal', 1, 90, 85) returning id`);

    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01755667788', 'Nusrat Jahan', 'buyer', '', '', 70, 92)`);

    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01655667788', 'Arifur Rahman', 'buyer', '', '', 60, 65)`);

    await q(`insert into users(phone, name, role, page_name, page_url, seller_trust, buyer_trust)
      values('01955667788', 'Farhan Kabir', 'buyer', '', '', 65, 75)`);

    await q(`insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values('01755667788', 12, 0, 0, 92)`);
    await q(`insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values('01655667788', 2, 1, 0, 65)`);
    await q(`insert into buyer_stats(phone, delivered, refused, disputes, trust_score) values('01955667788', 4, 1, 1, 75)`);

    await seedDemoDeals(s1, s2, s3);
    console.log("Seeding completed successfully.");
  } else {
    // Check if initial demo deals need upgrade to computeAmounts rules
    const oldProdDeal = await one("select total_amount from deals where code='PK-PROD-01'");
    if (oldProdDeal && Number(oldProdDeal.total_amount) !== 32441) {
      console.log("Upgrading initial demo deals to new computeAmounts rules...");
      const oldCodes = ["PK-PROD-01", "PK-PROD-02", "PK-PROD-03", "PK-RENT-01", "PK-SERV-01", "PK-PROD-04", "PK-PROD-05", "PK-PROD-06"];
      for (const code of oldCodes) {
        const d = await one("select id from deals where code=$1", [code]);
        if (d) {
          await q("delete from disputes where deal_id=$1", [d.id]);
          await q("delete from tracking_events where deal_id=$1", [d.id]);
          await q("delete from deal_events where deal_id=$1", [d.id]);
          await q("delete from ledger where deal_id=$1", [d.id]);
          await q("delete from notifications where deal_code=$1", [code]);
          await q("delete from deals where id=$1", [d.id]);
        }
      }
      const s1 = await one("select id from users where phone='01711223344'");
      const s2 = await one("select id from users where phone='01811223344'");
      const s3 = await one("select id from users where phone='01911223344'");
      if (s1 && s2 && s3) {
        await seedDemoDeals(s1, s2, s3);
      }
    }
  }
  // Ensure 50 realistic mock deals exist in any environment (Render PostgreSQL or local SQLite)
  try {
    const { seed50MockDeals } = await import("./services/mockDeals.js");
    await seed50MockDeals({ force: false });
  } catch (mErr) {
    console.warn("[MOCK SEED WARNING]", mErr.message);
  }
}

async function seedDemoDeals(s1, s2, s3) {
  const a1 = computeAmounts({ dealType: "product", mode: "full_payment", price: 32000, charge: 120, returnCharge: 120 });
    const d1 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust, ship_by)
      values('PK-PROD-01', 'product', 'full_payment', $1, $2, '01755667788', 'Nusrat Jahan', 'House 14, Road 5, Dhanmondi, Dhaka', 'Dhaka',
        'Sony WH-1000XM5 Wireless Headphones (Midnight Blue)', 'Original brand new sealed with warranty card',
        32000, 120, $3, $4, $5, $3, 'buyer_pays', 120,
        'shipped', 'Steadfast', 'ST-889021', 'in_transit', 12, 'Verified high-trust buyer', 92,
        datetime('now', '+2 days')) returning id
    `, [a1.cod_amount, s1.id, a1.total_amount, a1.fee_amount, a1.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created by seller Rahim Chowdhury')`, [d1.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer deposited ${a1.total_amount} BDT via bKash Escrow')`, [d1.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Seller dispatched via Steadfast Courier (Tracking: ST-889021)')`, [d1.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'courier_update', 'Steadfast: Parcel in transit to Dhanmondi Hub')`, [d1.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01755667788', $2, 'Escrow hold for Sony WH-1000XM5')`, [d1.id, a1.total_amount]);

    // D2: Delivered demo (delivery_only, 72h window active)
    const a2 = computeAmounts({ dealType: "product", mode: "delivery_only", price: 4500, charge: 100, returnCharge: 100 });
    const d2 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust, confirm_by, auto_release_at, auto_release_paused)
      values('PK-PROD-02', 'product', 'delivery_only', $1, $2, '01655667788', 'Arifur Rahman', 'Block C, House 22, Kandirpar, Cumilla', 'Cumilla',
        'Mechanical Gaming Keyboard (Cherry MX Red)', 'RGB Hot-swappable keyboard with extra keycaps',
        4500, 100, $3, $4, $5, $3, 'seller_pays', 100,
        'delivered', 'Pathao', 'PT-99321', 'delivered', 24, 'Delivery to outside Dhaka', 65,
        datetime('now', '+3 days'), datetime('now', '+3 days'), 0) returning id
    `, [a2.cod_amount, s1.id, a2.total_amount, a2.fee_amount, a2.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created')`, [d2.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer deposited ${a2.total_amount} BDT into escrow')`, [d2.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Shipped via Pathao Courier (PT-99321)')`, [d2.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'delivered', 'Pathao confirmed delivered to buyer. 72-hour verification window started.')`, [d2.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01655667788', $2, 'Escrow deposit for Mechanical Keyboard')`, [d2.id, a2.total_amount]);

    // D3: Seller-fault dispute demo (delivery_only, damaged in transit)
    const a3 = computeAmounts({ dealType: "product", mode: "delivery_only", price: 24000, charge: 100, returnCharge: 100 });
    const d3 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust)
      values('PK-PROD-03', 'product', 'delivery_only', $1, $2, '01955667788', 'Farhan Kabir', 'Sector 7, Road 12, Uttara, Dhaka', 'Dhaka',
        'Samsung Galaxy Watch 6 (Graphite 44mm)', 'Brand new unopened Bluetooth smartwatch',
        24000, 100, $3, $4, $5, $3, 'buyer_pays', 100,
        'disputed', 'Steadfast', 'ST-771234', 'delivered', 18, 'Standard order', 75) returning id
    `, [a3.cod_amount, s1.id, a3.total_amount, a3.fee_amount, a3.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer paid ${a3.total_amount} BDT into escrow')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Shipped with tracking ST-771234')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'delivered', 'Delivered by courier')`, [d3.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'disputed', 'Buyer filed dispute: Screen cracked upon opening parcel')`, [d3.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01955667788', $2, 'Escrow deposit for Galaxy Watch 6')`, [d3.id, a3.total_amount]);

    await q(`
      insert into disputes(deal_id, raised_by_phone, reason, category, evidence_text, ai_summary, ai_recommendation, status)
      values($1, '01955667788', 'Screen cracked upon opening parcel. Looks like impact during courier transit.',
        'damaged', 'Unboxing photo shows front glass shattered while original box seal was tampered.',
        'AI Analysis: Image indicates deep crack lines on watch face matching transit impact or drop damage. Matches claimed damaged condition.',
        'uphold', 'open')
    `, [d3.id]);

    // D4: Rental deal (full_payment, held)
    const a4 = computeAmounts({ dealType: "rental", mode: "full_payment", price: 40000, charge: 0 });
    const d4 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status,
        seller_confirmed, buyer_confirmed, risk_score, risk_reasons, buyer_trust)
      values('PK-RENT-01', 'rental', 'full_payment', $1, $2, '01755667788', 'Nusrat Jahan', 'Flat 4B, Road 9/A, Dhanmondi, Dhaka', 'Dhaka',
        '2-Month Studio Apartment Security Deposit & Booking', 'Furnished bachelor studio. Terms: 30-day notice period, key handover upon inspection.',
        40000, 0, $3, $4, $5, $3, 'held',
        0, 0, 10, 'High value rental deal; requires dual party verification', 92) returning id
    `, [a4.cod_amount, s3.id, a4.total_amount, a4.fee_amount, a4.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Rental agreement terms created by Landlord Kamal Hossain')`, [d4.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Tenant Nusrat Jahan deposited ${a4.total_amount} BDT into escrow. Funds secured until key handover.')`, [d4.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01755667788', $2, 'Rental escrow deposit for Flat 4B Dhanmondi')`, [d4.id, a4.total_amount]);

    // D5: Service deal (full_payment, released)
    const a5 = computeAmounts({ dealType: "service", mode: "full_payment", price: 15000, charge: 0 });
    const d5 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status, outcome,
        seller_confirmed, buyer_confirmed, risk_score, risk_reasons, buyer_trust)
      values('PK-SERV-01', 'service', 'full_payment', $1, $2, '01655667788', 'Arifur Rahman', 'Gulshan-2, Dhaka', 'Dhaka',
        'Next.js E-Commerce Frontend Integration Milestone', 'Complete responsive UI implementation, payment gateway integration and deployment to Vercel.',
        15000, 0, $3, $4, $5, $3, 'released', 'both_confirmed',
        1, 1, 15, 'Service contract', 65) returning id
    `, [a5.cod_amount, s2.id, a5.total_amount, a5.fee_amount, a5.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Milestone agreement established')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Client funded ${a5.total_amount} BDT to escrow')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'completed_freelancer', 'Freelancer submitted deliverable code repository')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'completed_client', 'Client reviewed code and confirmed satisfactory handover')`, [d5.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'released', 'Funds released: ${a5.seller_payout} BDT paid to seller, ${a5.fee_amount} BDT platform fee collected')`, [d5.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01655667788', $2, 'Milestone escrow hold')`, [d5.id, a5.total_amount]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'payout_seller', $2, '01811223344', $3, 'Payout to Freelancer Tanvir Ahmed')`, [d5.id, a5.seller_payout, a5.fee_amount]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'platform_fee', $2, 'system', 0, 'Platform fee for PK-SERV-01')`, [d5.id, a5.fee_amount]);

    // D6: Created product deal (delivery_only, unbacked until buyer payment)
    const a6 = computeAmounts({ dealType: "product", mode: "delivery_only", price: 8500, charge: 100, returnCharge: 100 });
    const d6 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, risk_score, risk_reasons, buyer_trust)
      values('PK-PROD-04', 'product', 'delivery_only', $1, $2, '01755667788', 'Nusrat Jahan', 'Mirpur 10, Dhaka', 'Dhaka',
        'Pure Cotton Silk Jamdani Saree (Sky Blue)', 'Handcrafted authentic Jamdani saree with matching blouse piece',
        8500, 100, $3, $4, $5, 0, 'buyer_pays', 100,
        'created', 8, 'Low risk', 92) returning id
    `, [a6.cod_amount, s2.id, a6.total_amount, a6.fee_amount, a6.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created by seller Tanvir Ahmed. Waiting for buyer escrow payment.')`, [d6.id]);

    // D7: Refused-at-door demo (delivery_only, released with shipping compensation)
    const a7 = computeAmounts({ dealType: "product", mode: "delivery_only", price: 4200, charge: 100, returnCharge: 100 });
    const comp7 = Math.min(a7.held_amount, 100 + 100);
    const fee7 = Math.min(a7.fee_amount, a7.total_amount - comp7);
    const refund7 = Math.max(0, a7.total_amount - comp7 - fee7);

    const d7 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, outcome, courier_name, tracking_id, courier_status, risk_score, risk_reasons, buyer_trust)
      values('PK-PROD-05', 'product', 'delivery_only', $1, $2, '01655667788', 'Arifur Rahman', 'Kandirpar, Cumilla', 'Cumilla',
        'Bata Men Oxford Formal Shoes (Doorstep Refusal Demo)', 'Refused at door. Shipping compensation released to seller.',
        4200, 100, $3, $4, $5, $3, 'buyer_pays', 100,
        'released', 'refused_at_door', 'Steadfast', 'ST-441209', 'refused', 25, 'Doorstep refusal settled', 65) returning id
    `, [a7.cod_amount, s2.id, a7.total_amount, a7.fee_amount, a7.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created')`, [d7.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer deposited ${a7.total_amount} BDT into escrow')`, [d7.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'shipped', 'Seller dispatched via Steadfast Courier')`, [d7.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'refused', 'Buyer refused at doorstep. Shipping compensation released to seller.')`, [d7.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01655667788', $2, 'Escrow deposit for Bata Oxford Shoes')`, [d7.id, a7.total_amount]);
    if (comp7 > 0) {
      await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
        values($1, 'payout_seller', $2, '01811223344', $3, 'Shipping compensation for refused order')`, [d7.id, comp7, fee7 + refund7]);
    }
    if (fee7 > 0) {
      await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
        values($1, 'platform_fee', $2, 'system', $3, 'Platform fee for refused order')`, [d7.id, fee7, refund7]);
    }
    if (refund7 > 0) {
      await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
        values($1, 'refund_buyer', $2, '01655667788', 0, 'Refund of balance after delivery deductions')`, [d7.id, refund7]);
    }

    // D8: Seller-timeout refund demo (full_payment, refunded)
    const a8 = computeAmounts({ dealType: "product", mode: "full_payment", price: 16500, charge: 120, returnCharge: 120 });
    const d8 = await one(`
      insert into deals(code, deal_type, payment_mode, cod_amount, seller_id, buyer_phone, buyer_name, address, area, product, details,
        price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, return_policy, return_charge,
        status, outcome, courier_name, risk_score, risk_reasons, buyer_trust)
      values('PK-PROD-06', 'product', 'full_payment', $1, $2, '01722334455', 'Sadia Islam', 'House 6, Road 14, Dhanmondi, Dhaka', 'Dhaka',
        'Vintage Mechanical Record Player & Turntable (Timeout Refund Demo)', 'Seller missed dispatch deadline. 100% refunded to buyer.',
        16500, 120, $3, $4, $5, $3, 'buyer_pays', 120,
        'refunded', 'seller_ship_timeout', 'Steadfast', 20, 'Auto-refunded due to shipping timeout', 88) returning id
    `, [a8.cod_amount, s1.id, a8.total_amount, a8.fee_amount, a8.seller_payout]);

    await q(`insert into deal_events(deal_id, kind, note) values($1, 'created', 'Deal created')`, [d8.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'paid', 'Buyer deposited ${a8.total_amount} BDT into escrow')`, [d8.id]);
    await q(`insert into deal_events(deal_id, kind, note) values($1, 'refunded', 'Seller missed shipping deadline. Buyer fully refunded ${a8.total_amount} BDT.')`, [d8.id]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'hold', $2, '01722334455', $2, 'Escrow deposit for Turntable')`, [d8.id, a8.total_amount]);
    await q(`insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
      values($1, 'refund_buyer', $2, '01722334455', 0, 'Auto-refund: Seller missed dispatch deadline')`, [d8.id, a8.total_amount]);

    await q(`insert into notifications(phone, title, message, deal_code)
      values('01755667788', 'Deal Ready for Payment', 'Gadget Corner BD created deal PK-PROD-01. Please deposit into escrow to secure your order.', 'PK-PROD-01')`);
    await q(`insert into notifications(phone, title, message, deal_code)
      values('01655667788', 'Parcel Delivered', 'Your order PK-PROD-02 has been delivered by Pathao Courier. Please inspect and confirm receipt within 72 hours.', 'PK-PROD-02')`);
    await q(`insert into notifications(phone, title, message, deal_code)
      values('01700000000', 'New Dispute Filed', 'Buyer Farhan Kabir filed a dispute on deal PK-PROD-03 (Damaged product). Review required.', 'PK-PROD-03')`);

  console.log("Initial demo deals seeded successfully.");
}
