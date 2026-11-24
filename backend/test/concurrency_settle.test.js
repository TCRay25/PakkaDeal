import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb, q, one, transaction } from "../src/db.js";
import {
  releaseToSeller,
  adminForceRefund,
  adminSplitResolution,
  applyPayment,
} from "../src/services/settle.js";

test("db.transaction(fn) commits on success and rolls back on error", async () => {
  await initDb();
  const testPhone = "01999887766";
  await q("delete from users where phone=$1", [testPhone]);

  // 1. Success commit
  await transaction(async () => {
    await q("insert into users(phone, name, role) values($1, 'Tx User', 'buyer')", [testPhone]);
  });
  const savedUser = await one("select * from users where phone=$1", [testPhone]);
  assert.ok(savedUser, "User should be committed after successful transaction");

  // 2. Rollback on error
  await assert.rejects(
    async () => {
      await transaction(async () => {
        await q("update users set name='RolledBack Name' where phone=$1", [testPhone]);
        throw new Error("Simulated failure inside transaction");
      });
    },
    /Simulated failure inside transaction/
  );

  const afterRollback = await one("select * from users where phone=$1", [testPhone]);
  assert.equal(afterRollback.name, "Tx User", "Transaction should have rolled back the name update");

  // Cleanup
  await q("delete from users where phone=$1", [testPhone]);
});

test("Concurrency test: 20 parallel releaseToSeller calls result in exactly one ledger payout", async () => {
  await initDb();

  // Find or create a verified seller
  let seller = await one("select * from users where role='seller' and bkash_verified=1 limit 1");
  if (!seller) {
    seller = await one(`
      insert into users(phone, name, role, bkash_number, bkash_type, bkash_verified)
      values('01700998877', 'Verified Seller', 'seller', '01700998877', 'Personal', 1)
      returning *
    `);
  }

  const code = "CONCUR-REL-" + Date.now();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01788776655', 'Concur Buyer', 'Dhaka', 'Mechanical Keyboard', 4000, 100, 4140, 40, 4100, 4140, 'delivered')
    returning *
  `, [code, seller.id]);

  assert.equal(deal.status, "delivered");

  // Fire 20 parallel release calls
  const promises = Array.from({ length: 20 }, () => releaseToSeller(deal, "buyer_confirmed", "buyer"));
  const results = await Promise.allSettled(promises);

  // Assert that at least one succeeded and none failed with unexpected errors
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1, "At least one call fulfilled successfully");

  // Assert exactly ONE payout_seller in ledger
  const payouts = await q(
    "select * from ledger where deal_id=$1 and transaction_type='payout_seller'",
    [deal.id]
  );
  assert.equal(payouts.length, 1, `Expected exactly 1 payout_seller ledger row, got ${payouts.length}`);

  // Assert exactly ONE platform_fee in ledger
  const fees = await q(
    "select * from ledger where deal_id=$1 and transaction_type='platform_fee'",
    [deal.id]
  );
  assert.equal(fees.length, 1, `Expected exactly 1 platform_fee ledger row, got ${fees.length}`);

  // Assert deal is now released
  const finalDeal = await one("select * from deals where id=$1", [deal.id]);
  assert.equal(finalDeal.status, "released");

  // Cleanup
  await q("delete from ledger where deal_id=$1", [deal.id]);
  await q("delete from deal_events where deal_id=$1", [deal.id]);
  await q("delete from deals where id=$1", [deal.id]);
});

test("Concurrency test: 20 parallel adminForceRefund calls result in exactly one ledger refund", async () => {
  await initDb();

  const seller = await one("select * from users where role='seller' limit 1");
  const code = "CONCUR-REF-" + Date.now();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01788776655', 'Refund Buyer', 'Dhaka', 'Gaming Mouse', 2000, 100, 2120, 20, 2100, 2120, 'held')
    returning *
  `, [code, seller.id]);

  assert.equal(deal.status, "held");

  // Fire 20 parallel refund calls
  const promises = Array.from({ length: 20 }, () => adminForceRefund(deal, "Parallel refund test", "admin"));
  const results = await Promise.allSettled(promises);

  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.ok(fulfilled.length >= 1, "At least one call fulfilled successfully");

  // Assert exactly ONE refund_buyer in ledger
  const refunds = await q(
    "select * from ledger where deal_id=$1 and transaction_type='refund_buyer'",
    [deal.id]
  );
  assert.equal(refunds.length, 1, `Expected exactly 1 refund_buyer ledger row, got ${refunds.length}`);

  // Assert deal is now refunded
  const finalDeal = await one("select * from deals where id=$1", [deal.id]);
  assert.equal(finalDeal.status, "refunded");

  // Cleanup
  await q("delete from ledger where deal_id=$1", [deal.id]);
  await q("delete from deal_events where deal_id=$1", [deal.id]);
  await q("delete from deals where id=$1", [deal.id]);
});

test("Split-resolution: validates that seller_amount + buyer_amount <= deal.total_amount", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "SPLIT-TEST-" + Date.now();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01788776655', 'Split Buyer', 'Dhaka', 'Headphones', 3000, 100, 3130, 30, 3100, 3130, 'disputed')
    returning *
  `, [code, seller.id]);

  // Exceeds total_amount (2000 + 2000 = 4000 > 3130) -> MUST THROW
  await assert.rejects(
    async () => {
      await adminSplitResolution(deal, 2000, 2000, "Invalid split amount test", "admin");
    },
    /cannot exceed deal total amount/
  );

  // Valid split amount (2000 + 1130 = 3130 <= 3130) -> MUST SUCCEED
  const resolved = await adminSplitResolution(deal, 2000, 1130, "Valid split amount test", "admin");
  assert.equal(resolved.status, "released");

  const sellerLedger = await one(
    "select * from ledger where deal_id=$1 and transaction_type='payout_seller'",
    [deal.id]
  );
  assert.equal(sellerLedger.amount, 2000);

  const buyerLedger = await one(
    "select * from ledger where deal_id=$1 and transaction_type='refund_buyer'",
    [deal.id]
  );
  assert.equal(buyerLedger.amount, 1130);

  // Cleanup
  await q("delete from ledger where deal_id=$1", [deal.id]);
  await q("delete from deal_events where deal_id=$1", [deal.id]);
  await q("delete from deals where id=$1", [deal.id]);
});

test("Unique index on ledger prevents duplicate payout_seller and refund_buyer per deal", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "UNIQUE-IDX-" + Date.now();
  const deal = await one(`
    insert into deals(code, deal_type, seller_id, buyer_phone, buyer_name, address, product, price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status)
    values($1, 'product', $2, '01788776655', 'Idx Buyer', 'Dhaka', 'Watch', 1000, 100, 1110, 10, 1100, 1110, 'created')
    returning *
  `, [code, seller.id]);

  // First insert succeeds
  await q(
    `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
     values($1, 'payout_seller', 1000, '01788776655', 0, 'First payout')`,
    [deal.id]
  );

  // Second insert of same deal_id and payout_seller MUST fail with unique constraint error
  await assert.rejects(
    async () => {
      await q(
        `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
         values($1, 'payout_seller', 1000, '01788776655', 0, 'Duplicate payout')`,
        [deal.id]
      );
    },
    /UNIQUE constraint failed|duplicate key value/i
  );

  // Cleanup
  await q("delete from ledger where deal_id=$1", [deal.id]);
  await q("delete from deals where id=$1", [deal.id]);
});
