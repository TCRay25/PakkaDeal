import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb, q, one } from "../src/db.js";
import {
  assertTransition,
  VALID_TRANSITIONS,
  applyPayment,
  applyShip,
  applyCourier,
  releaseToSeller,
  requestReturn,
  shipReturn,
  completeReturn,
  checkAllTimeouts,
} from "../src/services/settle.js";
import { getAdapter } from "../src/services/courierService.js";

test("state machine rejects invalid transitions", () => {
  assert.throws(() => assertTransition("created", "released", "buyer"), /Invalid deal status transition/);
  assert.throws(() => assertTransition("held", "released", "seller"), /Invalid deal status transition/);
  assert.doesNotThrow(() => assertTransition("created", "held", "buyer"));
  assert.doesNotThrow(() => assertTransition("held", "shipped", "seller"));
  // Admin can override
  assert.doesNotThrow(() => assertTransition("created", "released", "admin"));
});

test("courier adapters return structured status", async () => {
  const sf = getAdapter("Steadfast");
  const sfStatus = await sf.getStatus("DELIV-123");
  assert.equal(sfStatus.status, "delivered");

  const pathao = getAdapter("Pathao");
  const pStatus = await pathao.getStatus("RET-99");
  assert.equal(pStatus.status, "returned");

  const redx = getAdapter("RedX");
  const rxStatus = await redx.getStatus("IN-TRANSIT-10");
  assert.equal(rxStatus.status, "in_transit");

  const manual = getAdapter("Other");
  const mStatus = await manual.getStatus("ANY");
  assert.equal(mStatus.status, "manual_review");
});

test("returns workflow: requested -> shipped -> received & refunded", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "RET-TEST-" + Date.now();

  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01711223344', 'Return Buyer', 'Dhaka', 'Returned Shoes', 2000, 100, 2100, 42, 2058, 2100, 'created')
    returning *
  `, [code, seller.id]);

  // Pay
  const held = await applyPayment(deal, "bKash");
  // Ship
  const shipped = await applyShip(held, "Pathao", "PA-12345");
  // Deliver
  const delivered = await applyCourier(shipped, "delivered");
  assert.equal(delivered.status, "delivered");

  // Buyer requests return
  const retReq = await requestReturn(delivered, "Wrong size received", "buyer");
  assert.equal(retReq.status, "return_requested");
  assert.equal(retReq.auto_release_paused, 1);

  // Buyer ships return
  const retShipped = await shipReturn(retReq, "Pathao", "PA-RET-999");
  assert.equal(retShipped.status, "return_shipped");

  // Seller confirms receipt of return
  const refunded = await completeReturn(retShipped, "seller");
  assert.equal(refunded.status, "refunded");
  assert.equal(refunded.outcome, "return_received");

  // Cleanup
  await q("delete from ledger where deal_id = $1", [deal.id]);
  await q("delete from deal_events where deal_id = $1", [deal.id]);
  await q("delete from deals where id = $1", [deal.id]);
});

test("24-hour auto-release countdown triggers when expired", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "AUTO-TEST-" + Date.now();

  // Create delivered deal whose auto_release_at is in the past
  const pastTime = new Date(Date.now() - 36e5).toISOString();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status, auto_release_at, auto_release_paused)
    values($1, 'product', $2, '01755667788', 'Auto Buyer', 'Dhaka', 'Auto Release Item', 3000, 100, 3100, 62, 3038, 3100, 'delivered', $3, 0)
    returning *
  `, [code, seller.id, pastTime]);

  // Run timeout checker
  await checkAllTimeouts();

  const refreshed = await one("select * from deals where id=$1", [deal.id]);
  assert.equal(refreshed.status, "released");
  assert.equal(refreshed.outcome, "auto_release_timeout");

  // Cleanup
  await q("delete from ledger where deal_id = $1", [deal.id]);
  await q("delete from deal_events where deal_id = $1", [deal.id]);
  await q("delete from deals where id = $1", [deal.id]);
});
