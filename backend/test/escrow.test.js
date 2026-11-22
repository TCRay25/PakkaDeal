import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb, q, one } from "../src/db.js";
import { calculateFee, applyPayment, applyShip, applyCourier, releaseToSeller } from "../src/services/settle.js";

test("escrow fee calculation: 1% with 10 BDT min", async () => {
  await initDb();
  assert.equal(await calculateFee(100), 10);
  assert.equal(await calculateFee(1000), 10);
  assert.equal(await calculateFee(32000), 320);
});

test("escrow payment and payout flow", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  assert.ok(seller, "seller exists");

  const code = "TEST-DEAL-" + Date.now();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01799887766', 'Test Buyer', 'Dhaka', 'Test Headset', 5000, 100, 5151, 51, 5100, 5151, 'created')
    returning *
  `, [code, seller.id]);

  assert.equal(deal.status, "created");

  // Pay into escrow
  const paid = await applyPayment(deal, "bKash");
  assert.equal(paid.status, "held");

  // Ship
  const shipped = await applyShip(paid, "Steadfast", "ST-TEST-" + Date.now());
  assert.equal(shipped.status, "shipped");

  // Courier delivered
  const delivered = await applyCourier(shipped, "delivered");
  assert.equal(delivered.status, "delivered");
  assert.ok(delivered.confirm_by);

  // Buyer confirms -> released
  const released = await releaseToSeller(delivered, "buyer_confirmed");
  assert.equal(released.status, "released");
  assert.equal(released.outcome, "buyer_confirmed");

  // Clean up
  await q("delete from ledger where deal_id = $1", [deal.id]);
  await q("delete from deal_events where deal_id = $1", [deal.id]);
  await q("delete from deals where id = $1", [deal.id]);
});

test("seller payout is blocked if seller's bkash is not verified", async () => {
  await initDb();
  // Create unverified seller
  const unverified = await one(`
    insert into users(phone, name, role, bkash_number, bkash_type, bkash_verified)
    values('01799112233', 'Unverified Seller', 'seller', '01799112233', 'Personal', 0)
    returning *
  `);

  const code = "UNVERIFIED-DEAL-" + Date.now();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01799887766', 'Test Buyer', 'Dhaka', 'Test Item', 2000, 100, 2120, 20, 2100, 2120, 'delivered')
    returning *
  `, [code, unverified.id]);

  // Attempt release to unverified seller should throw error
  await assert.rejects(
    async () => {
      await releaseToSeller(deal, "buyer_confirmed");
    },
    /Seller bKash account is not verified by admin/
  );

  // Now verify the seller's bKash account
  await q("update users set bkash_verified=1 where id=$1", [unverified.id]);

  // Now release should succeed
  const released = await releaseToSeller(deal, "buyer_confirmed");
  assert.equal(released.status, "released");

  // Clean up
  await q("delete from ledger where deal_id = $1", [deal.id]);
  await q("delete from deal_events where deal_id = $1", [deal.id]);
  await q("delete from deals where id = $1", [deal.id]);
  await q("delete from users where id = $1", [unverified.id]);
});
