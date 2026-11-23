import { q, initDb } from "../src/db.js";

async function verify() {
  await initDb();
  const summary = await q("select status, count(id) as count from deals where code like 'PK-MOCK-%' group by status order by count desc");
  const total = await q("select count(id) as total from deals where code like 'PK-MOCK-%'");
  const disputes = await q("select d.code, dis.category, dis.ai_recommendation, substr(dis.reason, 1, 40) as reason from disputes dis join deals d on dis.deal_id=d.id where d.code like 'PK-MOCK-%'");
  const ledger = await q("select l.transaction_type, count(l.id) as count, sum(l.amount) as total_bdt from ledger l join deals d on l.deal_id=d.id where d.code like 'PK-MOCK-%' group by l.transaction_type");
  const tracking = await q("select count(t.id) as count from tracking_events t join deals d on t.deal_id=d.id where d.code like 'PK-MOCK-%'");
  const events = await q("select count(e.id) as count from deal_events e join deals d on e.deal_id=d.id where d.code like 'PK-MOCK-%'");

  console.log("=== 50 MOCK DEALS BREAKDOWN BY PHASE ===");
  console.table(summary);
  console.log(`Total Mock Deals Created: ${total[0]?.total}`);

  console.log("\n=== DISPUTES IN ADMIN QUEUE ===");
  console.table(disputes);

  console.log("\n=== FINANCIAL LEDGER SUMMARY (BDT) ===");
  console.table(ledger);

  console.log(`\nTracking events created: ${tracking[0]?.count}`);
  console.log(`Deal progression events created: ${events[0]?.count}`);

  process.exit(0);
}

verify().catch(console.error);
