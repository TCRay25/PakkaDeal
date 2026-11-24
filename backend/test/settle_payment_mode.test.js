import test from "node:test";
import assert from "node:assert/strict";
import { initDb, one, q, transaction } from "../src/db.js";
import { computeAmounts } from "../src/services/amounts.js";
import {
  applyPayment,
  applyShip,
  applyCourier,
  releaseToSeller,
  checkAllTimeouts,
  settleRefusalCompensation,
  completeReturn,
  adminForceRelease,
  adminForceRefund,
  adminSplitResolution,
} from "../src/services/settle.js";

async function getOrCreateTestUser(phone, name, role = "seller") {
  let u = await one("select * from users where phone=$1", [phone]);
  if (!u) {
    u = await one(
      "insert into users(phone, name, role, bkash_number, bkash_verified) values($1, $2, $3, $4, 1) returning *",
      [phone, name, role, phone]
    );
  } else if (!u.bkash_verified) {
    await q("update users set bkash_verified=1 where id=$1", [u.id]);
    u = await one("select * from users where id=$1", [u.id]);
  }
  return u;
}

test("1. delivered: seller gets the held charge, never the product price (both modes, buyer confirm & timeout)", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711001122", "Delivery Only Seller", "seller");
  const buyer = await getOrCreateTestUser("01722001122", "Delivery Only Buyer", "buyer");

  // 1A. delivery_only - Buyer Confirms
  const amounts1 = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 5000,
    charge: 120,
    returnCharge: 120,
    feePercent: 2,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(amounts1.held_amount, 240); // 120 + 120
  assert.equal(amounts1.cod_amount, 5000); // collected by courier at doorstep
  assert.equal(amounts1.fee_amount, 10); // max(10, round(240 * 0.02 = 4.8)) = 10
  assert.equal(amounts1.total_amount, 250); // 240 + 10
  assert.equal(amounts1.seller_payout, 240);

  const code1 = "DELIV-CONFIRM-" + Date.now();
  let deal1 = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'delivery_only', $2, $3, $4, $5, $6, 'Gulshan 2, Dhaka', 'Noise Cancelling Headphones', $7, 120, 120, $8, 2, $9, $10, 'created')
     returning *`,
    [code1, amounts1.cod_amount, seller.id, buyer.id, buyer.phone, buyer.name, 5000, amounts1.fee_amount, amounts1.total_amount, amounts1.seller_payout]
  );

  // 1B. delivery_only - Auto Release Timeout
  const code2 = "DELIV-TIMEOUT-" + Date.now();
  let deal2 = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'delivery_only', $2, $3, $4, $5, $6, 'Uttara, Dhaka', 'Mechanical Keyboard', $7, 120, 120, $8, 2, $9, $10, 'created')
     returning *`,
    [code2, amounts1.cod_amount, seller.id, buyer.id, buyer.phone, buyer.name, 5000, amounts1.fee_amount, amounts1.total_amount, amounts1.seller_payout]
  );

  // 1C. full_payment - Delivery Released
  const amountsFull = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 5000,
    charge: 120,
    returnCharge: 120,
    feePercent: 2,
    feeMin: 10,
  });
  assert.equal(amountsFull.held_amount, 5120); // 5000 + 120
  assert.equal(amountsFull.cod_amount, 0);
  assert.equal(amountsFull.fee_amount, 102); // round(5120 * 0.02) = 102
  assert.equal(amountsFull.total_amount, 5222);
  assert.equal(amountsFull.seller_payout, 5120);

  const code3 = "FULL-DELIV-" + Date.now();
  let deal3 = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'full_payment', $2, $3, $4, $5, $6, 'Banani, Dhaka', 'DSLR Camera', $7, 120, 120, $8, 2, $9, $10, 'created')
     returning *`,
    [code3, amountsFull.cod_amount, seller.id, buyer.id, buyer.phone, buyer.name, 5000, amountsFull.fee_amount, amountsFull.total_amount, amountsFull.seller_payout]
  );

  try {
    // Test 1A: delivery_only buyer confirmation
    deal1 = await applyPayment(deal1, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-DELIV-1" });
    deal1 = await applyShip(deal1, "Pathao", "PA-DELIV-1");
    deal1 = await applyCourier(deal1, "delivered");
    const released1 = await releaseToSeller(deal1, "buyer_confirmed", "buyer");
    assert.equal(released1.status, "released");

    const ledger1 = await q("select * from ledger where deal_id=$1", [deal1.id]);
    const sellerPayoutRow1 = ledger1.find((l) => l.transaction_type === "payout_seller");
    const platformFeeRow1 = ledger1.find((l) => l.transaction_type === "platform_fee");

    assert.ok(sellerPayoutRow1);
    assert.equal(sellerPayoutRow1.amount, 240, "In delivery_only, seller receives strictly held delivery deposit (240 BDT), NEVER product price (5000 BDT)");
    assert.ok(platformFeeRow1);
    assert.equal(platformFeeRow1.amount, 10);
    assert.equal(sellerPayoutRow1.amount + platformFeeRow1.amount, amounts1.total_amount);

    // Test 1B: delivery_only auto-release timeout
    deal2 = await applyPayment(deal2, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-DELIV-2" });
    deal2 = await applyShip(deal2, "Steadfast", "SF-DELIV-2");
    deal2 = await applyCourier(deal2, "delivered");

    const pastTime = new Date(Date.now() - 36e5).toISOString();
    await q("update deals set auto_release_at=$1 where id=$2", [pastTime, deal2.id]);
    await checkAllTimeouts();

    const released2 = await one("select * from deals where id=$1", [deal2.id]);
    assert.equal(released2.status, "released");
    assert.equal(released2.outcome, "auto_release_timeout");

    const ledger2 = await q("select * from ledger where deal_id=$1", [deal2.id]);
    const sellerPayoutRow2 = ledger2.find((l) => l.transaction_type === "payout_seller");
    assert.ok(sellerPayoutRow2);
    assert.equal(sellerPayoutRow2.amount, 240, "Auto-release timeout also pays strictly held charge (240 BDT), NEVER product price");

    // Test 1C: full_payment delivery release
    deal3 = await applyPayment(deal3, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-FULL-3" });
    deal3 = await applyShip(deal3, "Pathao", "PA-FULL-3");
    deal3 = await applyCourier(deal3, "delivered");
    const released3 = await releaseToSeller(deal3, "buyer_confirmed", "buyer");
    assert.equal(released3.status, "released");

    const ledger3 = await q("select * from ledger where deal_id=$1", [deal3.id]);
    const sellerPayoutRow3 = ledger3.find((l) => l.transaction_type === "payout_seller");
    const platformFeeRow3 = ledger3.find((l) => l.transaction_type === "platform_fee");

    assert.ok(sellerPayoutRow3);
    assert.equal(sellerPayoutRow3.amount, 5120, "In full_payment, seller receives product price + delivery charge (5120 BDT)");
    assert.ok(platformFeeRow3);
    assert.equal(platformFeeRow3.amount, 102);
    assert.equal(sellerPayoutRow3.amount + platformFeeRow3.amount, amountsFull.total_amount);
  } finally {
    await q("delete from ledger where deal_id in ($1, $2, $3)", [deal1.id, deal2.id, deal3.id]);
    await q("delete from deal_events where deal_id in ($1, $2, $3)", [deal1.id, deal2.id, deal3.id]);
    await q("delete from deals where id in ($1, $2, $3)", [deal1.id, deal2.id, deal3.id]);
  }
});

test("2A. applyCourier refused in full_payment: compensation = min(held_amount, delivery + return), buyer gets remainder, nothing negative", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711002233", "Full Pay Seller", "seller");
  const buyer = await getOrCreateTestUser("01722002233", "Full Pay Buyer", "buyer");

  const amounts = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 2000,
    charge: 100,
    returnCharge: 100,
    feePercent: 2,
    feeMin: 10,
    minDeposit: 60,
  });

  const code = "FULL-REFUSE-" + Date.now();
  let deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'full_payment', $2, $3, $4, $5, $6, 'Dhanmondi, Dhaka', 'Mechanical Keyboard', $7, 100, 100, $8, 2, $9, $10, 'created')
     returning *`,
    [code, amounts.cod_amount, seller.id, buyer.id, buyer.phone, buyer.name, 2000, amounts.fee_amount, amounts.total_amount, amounts.seller_payout]
  );

  try {
    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-FULL-FUND" });
    deal = await applyShip(deal, "Steadfast", "SF-FULL-111");

    const refused = await applyCourier(deal, "refused");
    assert.equal(refused.status, "released");
    assert.equal(refused.outcome, "refused_at_door");

    // breakdown: delivery + return = 200; compensation = min(2100, 200) = 200; fee = 42; buyer refund = 1900
    const ledger = await q("select * from ledger where deal_id=$1", [deal.id]);
    const sellerPayoutRow = ledger.find((l) => l.transaction_type === "payout_seller");
    const platformFeeRow = ledger.find((l) => l.transaction_type === "platform_fee");
    const buyerRefundRow = ledger.find((l) => l.transaction_type === "refund_buyer");

    assert.ok(sellerPayoutRow);
    assert.equal(sellerPayoutRow.amount, 200);

    assert.ok(platformFeeRow);
    assert.equal(platformFeeRow.amount, 42);

    assert.ok(buyerRefundRow);
    assert.equal(buyerRefundRow.amount, 1900, "Buyer receives remainder (product price - return charge: 2000 - 100)");

    // Assert no negative values and total sum exactly matches total_amount
    assert.ok(sellerPayoutRow.amount >= 0);
    assert.ok(platformFeeRow.amount >= 0);
    assert.ok(buyerRefundRow.amount >= 0);
    assert.equal(sellerPayoutRow.amount + platformFeeRow.amount + buyerRefundRow.amount, amounts.total_amount);
  } finally {
    await q("delete from ledger where deal_id=$1", [deal.id]);
    await q("delete from deal_events where deal_id=$1", [deal.id]);
    await q("delete from deals where id=$1", [deal.id]);
  }
});

test("2B. Refused in delivery_only: compensation capped at held when held < (delivery + return), nothing negative", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711002244", "Capped Seller", "seller");
  const buyer = await getOrCreateTestUser("01722002244", "Capped Buyer", "buyer");

  // Held deposit is minimum 60 BDT (+10 fee = 70 total), but delivery + return = 150 + 150 = 300 BDT
  const code = "CAPPED-REFUSE-" + Date.now();
  let deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'delivery_only', 1500, $2, $3, $4, $5, 'Gazipur, Dhaka', 'Cotton Polo', 1500, 150, 150, 10, 1, 70, 60, 'created')
     returning *`,
    [code, seller.id, buyer.id, buyer.phone, buyer.name]
  );

  try {
    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-CAPPED-1" });
    deal = await applyShip(deal, "Pathao", "PA-CAPPED-1");

    deal = await applyCourier(deal, "refused");
    assert.equal(deal.status, "refused");

    const pastTime = new Date(Date.now() - 36e5).toISOString();
    await q("update deals set auto_release_at=$1 where id=$2", [pastTime, deal.id]);

    await checkAllTimeouts();

    const finalized = await one("select * from deals where id=$1", [deal.id]);
    assert.equal(finalized.status, "released");
    assert.equal(finalized.outcome, "refused_at_door");

    const ledger = await q("select * from ledger where deal_id=$1", [deal.id]);
    const sellerPayoutRow = ledger.find((l) => l.transaction_type === "payout_seller");
    const platformFeeRow = ledger.find((l) => l.transaction_type === "platform_fee");
    const buyerRefundRow = ledger.find((l) => l.transaction_type === "refund_buyer");

    // Compensation must be capped at held_amount (60), NOT 300
    assert.ok(sellerPayoutRow, "Seller compensation row must exist");
    assert.equal(sellerPayoutRow.amount, 60, "Compensation is capped at held deposit (60), not 300");

    assert.ok(platformFeeRow, "Platform fee row must exist");
    assert.equal(platformFeeRow.amount, 10, "Platform fee is 10");

    const buyerRefundAmount = buyerRefundRow ? buyerRefundRow.amount : 0;
    assert.equal(buyerRefundAmount, 0);

    assert.ok(sellerPayoutRow.amount >= 0);
    assert.ok(platformFeeRow.amount >= 0);
    assert.ok(buyerRefundAmount >= 0);
    assert.equal(sellerPayoutRow.amount + platformFeeRow.amount + buyerRefundAmount, 70);
  } finally {
    await q("delete from ledger where deal_id=$1", [deal.id]);
    await q("delete from deal_events where deal_id=$1", [deal.id]);
    await q("delete from deals where id=$1", [deal.id]);
  }
});

test("2C. Refused in delivery_only: buyer gets remainder when held > (delivery + return), nothing negative", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711002255", "Remainder Seller", "seller");
  const buyer = await getOrCreateTestUser("01722002255", "Remainder Buyer", "buyer");

  // Held deposit is 300 BDT (+10 fee = 310 total), courier charges are only 60 + 60 = 120 BDT
  const code = "REM-REFUSE-" + Date.now();
  let deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'delivery_only', 4000, $2, $3, $4, $5, 'Mohammadpur, Dhaka', 'Wireless Keyboard', 4000, 60, 60, 10, 1, 310, 300, 'created')
     returning *`,
    [code, seller.id, buyer.id, buyer.phone, buyer.name]
  );

  try {
    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-REM-1" });
    deal = await applyShip(deal, "Steadfast", "SF-REM-1");
    deal = await applyCourier(deal, "refused");

    const pastTime = new Date(Date.now() - 36e5).toISOString();
    await q("update deals set auto_release_at=$1 where id=$2", [pastTime, deal.id]);

    await checkAllTimeouts();

    const finalized = await one("select * from deals where id=$1", [deal.id]);
    assert.equal(finalized.status, "released");
    assert.equal(finalized.outcome, "refused_at_door");

    const ledger = await q("select * from ledger where deal_id=$1", [deal.id]);
    const sellerPayoutRow = ledger.find((l) => l.transaction_type === "payout_seller");
    const platformFeeRow = ledger.find((l) => l.transaction_type === "platform_fee");
    const buyerRefundRow = ledger.find((l) => l.transaction_type === "refund_buyer");

    assert.ok(sellerPayoutRow);
    assert.equal(sellerPayoutRow.amount, 120, "Seller receives shipping compensation (60 + 60 = 120)");

    assert.ok(platformFeeRow);
    assert.equal(platformFeeRow.amount, 10);

    assert.ok(buyerRefundRow, "Buyer refund row must exist for remainder deposit");
    assert.equal(buyerRefundRow.amount, 180, "Buyer gets remainder deposit: 310 - 120 - 10 = 180 BDT");

    assert.ok(sellerPayoutRow.amount >= 0);
    assert.ok(platformFeeRow.amount >= 0);
    assert.ok(buyerRefundRow.amount >= 0);
    assert.equal(sellerPayoutRow.amount + platformFeeRow.amount + buyerRefundRow.amount, 310);
  } finally {
    await q("delete from ledger where deal_id=$1", [deal.id]);
    await q("delete from deal_events where deal_id=$1", [deal.id]);
    await q("delete from deals where id=$1", [deal.id]);
  }
});

test("3. Fair-refusal rule in delivery_only: refusal starts review window, cron pays compensation when window ends", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711003344", "Fair Refusal Seller", "seller");
  const buyer = await getOrCreateTestUser("01722003344", "Fair Refusal Buyer", "buyer");

  const amounts = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 3000,
    charge: 100,
    returnCharge: 100,
    feePercent: 2,
    feeMin: 10,
    minDeposit: 60,
  });

  const code = "FAIR-REFUSE-1-" + Date.now();
  let deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'delivery_only', $2, $3, $4, $5, $6, 'Mirpur 10, Dhaka', 'Sneakers', $7, 100, 100, $8, 2, $9, $10, 'created')
     returning *`,
    [code, amounts.cod_amount, seller.id, buyer.id, buyer.phone, buyer.name, 3000, amounts.fee_amount, amounts.total_amount, amounts.seller_payout]
  );

  try {
    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-FAIR-1" });
    deal = await applyShip(deal, "RedX", "RX-FAIR-1");

    // Courier reports refusal for delivery_only deal
    const refusedDeal = await applyCourier(deal, "refused");

    // Must NOT pay seller instantly! Must be in status 'refused' with review window started
    assert.equal(refusedDeal.status, "refused");
    assert.equal(refusedDeal.outcome, "refused_at_door");
    assert.ok(refusedDeal.auto_release_at, "Review window deadline must be set");
    assert.equal(refusedDeal.auto_release_paused, 0);

    // Verify NO payout or refund was recorded yet
    const midLedger = await q("select * from ledger where deal_id=$1 and transaction_type in ('payout_seller', 'refund_buyer')", [deal.id]);
    assert.equal(midLedger.length, 0, "No funds may move before review window expires");

    // Simulate review window expiring (set auto_release_at to 1 hour in the past)
    const pastTime = new Date(Date.now() - 36e5).toISOString();
    await q("update deals set auto_release_at=$1 where id=$2", [pastTime, deal.id]);

    // Run checkAllTimeouts (cron)
    await checkAllTimeouts();

    // Now deal must be released and seller compensated
    const finalized = await one("select * from deals where id=$1", [deal.id]);
    assert.equal(finalized.status, "released");
    assert.equal(finalized.outcome, "refused_at_door");

    // Check ledger
    const finalLedger = await q("select * from ledger where deal_id=$1", [deal.id]);
    const sellerPayoutRow = finalLedger.find((l) => l.transaction_type === "payout_seller");
    const platformFeeRow = finalLedger.find((l) => l.transaction_type === "platform_fee");

    assert.ok(sellerPayoutRow, "Seller compensation must be settled by cron");
    assert.equal(sellerPayoutRow.amount, 200, "Seller receives shipping compensation (100 + 100)");

    assert.ok(platformFeeRow, "Platform fee must be recorded");
    assert.equal(platformFeeRow.amount, 10);
  } finally {
    await q("delete from ledger where deal_id=$1", [deal.id]);
    await q("delete from deal_events where deal_id=$1", [deal.id]);
    await q("delete from deals where id=$1", [deal.id]);
  }
});

test("4. Fair-refusal review window: with seller-fault claim funds remain frozen, admin resolution reconciles", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711004455", "Faulty Seller", "seller");
  const buyer = await getOrCreateTestUser("01722004455", "Claimant Buyer", "buyer");

  const amounts = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 4500,
    charge: 100,
    returnCharge: 100,
    feePercent: 2,
    feeMin: 10,
    minDeposit: 60,
  });

  const code = "FAIR-CLAIM-2-" + Date.now();
  let deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'delivery_only', $2, $3, $4, $5, $6, 'Uttara, Dhaka', 'Smart Watch', $7, 100, 100, $8, 2, $9, $10, 'created')
     returning *`,
    [code, amounts.cod_amount, seller.id, buyer.id, buyer.phone, buyer.name, 4500, amounts.fee_amount, amounts.total_amount, amounts.seller_payout]
  );

  let disputeId = null;

  try {
    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-FAIR-2" });
    deal = await applyShip(deal, "Pathao", "PA-FAIR-2");
    deal = await applyCourier(deal, "refused");
    assert.equal(deal.status, "refused");

    // Buyer files seller-fault claim (open dispute) during the 24h review window
    const dispute = await one(
      `insert into disputes(deal_id, raised_by_phone, reason, category, status)
       values($1, $2, 'Seller sent a fake toy instead of smartwatch', 'counterfeit', 'open')
       returning id`,
      [deal.id, buyer.phone]
    );
    disputeId = dispute.id;
    await q("update deals set status='disputed', outcome='disputed', auto_release_paused=1 where id=$1", [deal.id]);

    // Simulate review window expiration
    const pastTime = new Date(Date.now() - 36e5).toISOString();
    await q("update deals set auto_release_at=$1 where id=$2", [pastTime, deal.id]);

    // Run checkAllTimeouts
    await checkAllTimeouts();

    // Verify deal status remains disputed and funds frozen (NO payout to seller)
    const afterCron = await one("select * from deals where id=$1", [deal.id]);
    assert.equal(afterCron.status, "disputed", "Funds must remain frozen in disputed status");

    const ledger = await q("select * from ledger where deal_id=$1 and transaction_type='payout_seller'", [deal.id]);
    assert.equal(ledger.length, 0, "No payout to seller while dispute is pending");

    // Admin upholds dispute -> 100% full refund of total_amount to buyer
    await transaction(async () => {
      await q("update disputes set status='upheld', admin_notes='Fake goods confirmed' where id=$1", [disputeId]);
      await q("update deals set status='refunded', outcome='dispute_upheld' where id=$1", [deal.id]);
      await q(
        `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
         values($1, 'refund_buyer', $2, $3, 0, 'Admin upheld dispute')`,
        [deal.id, deal.total_amount, deal.buyer_phone]
      );
    });

    const refundRow = await one("select * from ledger where deal_id=$1 and transaction_type='refund_buyer'", [deal.id]);
    assert.ok(refundRow);
    assert.equal(refundRow.amount, amounts.total_amount, "Buyer receives 100% full refund when claim upheld");
  } finally {
    if (disputeId) {
      await q("delete from disputes where id=$1", [disputeId]);
    }
    await q("delete from ledger where deal_id=$1", [deal.id]);
    await q("delete from deal_events where deal_id=$1", [deal.id]);
    await q("delete from deals where id=$1", [deal.id]);
  }
});

test("5. Seller ship timeout: full refund of total_amount (held + fee) in both delivery_only and full_payment", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711005566", "Late Seller", "seller");
  const buyer = await getOrCreateTestUser("01722005566", "Waiting Buyer", "buyer");

  const pastShipBy = new Date(Date.now() - 36e5).toISOString();

  // Test 5A: delivery_only
  const amountsDeliv = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 3500,
    charge: 100,
    returnCharge: 100,
  });
  const codeDeliv = "TIMEOUT-DELIV-" + Date.now();
  const dealDeliv = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, deposit, status, ship_by
     ) values($1, 'product', 'delivery_only', $2, $3, $4, $5, $6, 'Baridhara, Dhaka', 'Bag', 3500, 100, 100, $7, 2, $8, $9, $8, 'held', $10)
     returning *`,
    [
      codeDeliv,
      amountsDeliv.cod_amount,
      seller.id,
      buyer.id,
      buyer.phone,
      buyer.name,
      amountsDeliv.fee_amount,
      amountsDeliv.total_amount,
      amountsDeliv.seller_payout,
      pastShipBy,
    ]
  );

  // Test 5B: full_payment
  const amountsFull = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 1500,
    charge: 80,
    returnCharge: 80,
  });
  const codeFull = "TIMEOUT-FULL-" + Date.now();
  const dealFull = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, deposit, status, ship_by
     ) values($1, 'product', 'full_payment', $2, $3, $4, $5, $6, 'Mohakhali, Dhaka', 'Shirt', 1500, 80, 80, $7, 2, $8, $9, $8, 'held', $10)
     returning *`,
    [
      codeFull,
      amountsFull.cod_amount,
      seller.id,
      buyer.id,
      buyer.phone,
      buyer.name,
      amountsFull.fee_amount,
      amountsFull.total_amount,
      amountsFull.seller_payout,
      pastShipBy,
    ]
  );

  try {
    await checkAllTimeouts();

    // Verify delivery_only refund
    const refreshedDeliv = await one("select * from deals where id=$1", [dealDeliv.id]);
    assert.equal(refreshedDeliv.status, "refunded");
    assert.equal(refreshedDeliv.outcome, "seller_ship_timeout");
    const ledgerDeliv = await one("select * from ledger where deal_id=$1 and transaction_type='refund_buyer'", [dealDeliv.id]);
    assert.ok(ledgerDeliv);
    assert.equal(ledgerDeliv.amount, amountsDeliv.total_amount, "Buyer receives full refund of total_amount (held + fee)");

    // Verify full_payment refund
    const refreshedFull = await one("select * from deals where id=$1", [dealFull.id]);
    assert.equal(refreshedFull.status, "refunded");
    assert.equal(refreshedFull.outcome, "seller_ship_timeout");
    const ledgerFull = await one("select * from ledger where deal_id=$1 and transaction_type='refund_buyer'", [dealFull.id]);
    assert.ok(ledgerFull);
    assert.equal(ledgerFull.amount, amountsFull.total_amount, "Buyer receives full refund of total_amount (held + fee)");
  } finally {
    await q("delete from ledger where deal_id in ($1, $2)", [dealDeliv.id, dealFull.id]);
    await q("delete from deal_events where deal_id in ($1, $2)", [dealDeliv.id, dealFull.id]);
    await q("delete from deals where id in ($1, $2)", [dealDeliv.id, dealFull.id]);
  }
});

test("6. Confirmation window: reads from confirm_window_hours setting (default 72)", async () => {
  await initDb();
  const seller = await getOrCreateTestUser("01711006677", "Delivery Seller", "seller");
  const buyer = await getOrCreateTestUser("01722006677", "Delivery Buyer", "buyer");

  const amounts = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 1000,
    charge: 60,
  });

  const code = "CONFIRM-WIN-" + Date.now();
  let deal = await one(
    `insert into deals(
       code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
       address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
       total_amount, seller_payout, status
     ) values($1, 'product', 'full_payment', 0, $2, $3, $4, $5, 'Dhaka', 'Book', 1000, 60, 60, $6, 2, $7, $8, 'created')
     returning *`,
    [code, seller.id, buyer.id, buyer.phone, buyer.name, amounts.fee_amount, amounts.total_amount, amounts.seller_payout]
  );

  try {
    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-WIN-1" });
    deal = await applyShip(deal, "Steadfast", "SF-WIN-1");
    deal = await applyCourier(deal, "delivered");

    assert.equal(deal.status, "delivered");
    assert.ok(deal.auto_release_at);

    // Verify auto_release_at is set to ~72 hours (confirm_window_hours default)
    const hoursDiff = (new Date(deal.auto_release_at).getTime() - Date.now()) / 36e5;
    assert.ok(hoursDiff >= 71 && hoursDiff <= 73, `Window must be ~72 hours, got ${hoursDiff.toFixed(2)}h`);

    // Verify deal event log recorded the setting value
    const event = await one("select * from deal_events where deal_id=$1 and kind='delivered'", [deal.id]);
    assert.ok(event);
    assert.match(event.note, /72-hour auto-release countdown started/i);
  } finally {
    await q("delete from ledger where deal_id=$1", [deal.id]);
    await q("delete from deal_events where deal_id=$1", [deal.id]);
    await q("delete from deals where id=$1", [deal.id]);
  }
});

test("7. Systematic Ledger Reconciliation: sum of payouts + refunds + fees equals held amount for EVERY final status in both modes", async () => {
  await initDb();

  async function createAndFundDeal({ mode, price, charge, returnCharge, feePercent = 1 }) {
    const seller = await getOrCreateTestUser("01711998877", "Reconciliation Seller", "seller");
    const buyer = await getOrCreateTestUser("01722998877", "Reconciliation Buyer", "buyer");
    const amounts = computeAmounts({
      dealType: "product",
      mode,
      price,
      charge,
      returnCharge,
      feePercent,
      feeMin: 10,
      minDeposit: 60,
    });

    const code = "RECON-" + mode.slice(0, 4).toUpperCase() + "-" + Math.random().toString(36).slice(2, 8);
    let deal = await one(
      `insert into deals(
         code, deal_type, payment_mode, cod_amount, seller_id, buyer_id, buyer_phone, buyer_name,
         address, product, price, delivery_charge, return_charge, fee_amount, fee_percent,
         total_amount, seller_payout, status
       ) values($1, 'product', $2, $3, $4, $5, $6, $7, 'Dhaka', 'Reconciliation Test Item', $8, $9, $10, $11, $12, $13, $14, 'created')
       returning *`,
      [
        code,
        mode,
        amounts.cod_amount,
        seller.id,
        buyer.id,
        buyer.phone,
        buyer.name,
        price,
        charge,
        returnCharge,
        amounts.fee_amount,
        feePercent,
        amounts.total_amount,
        amounts.seller_payout,
      ]
    );

    deal = await applyPayment(deal, { paymentMethod: "bKash", senderNumber: buyer.phone, trxId: "TX-" + code });
    return deal;
  }

  async function verifyReconciliation(dealId) {
    const finalizedDeal = await one("select * from deals where id=$1", [dealId]);
    assert.ok(
      ["released", "refunded"].includes(finalizedDeal.status),
      `Final status must be released or refunded, got: ${finalizedDeal.status}`
    );

    const ledger = await q("select * from ledger where deal_id=$1", [dealId]);
    const holdRow = ledger.find((l) => l.transaction_type === "hold");
    assert.ok(holdRow, "Escrow hold entry must exist in ledger");
    assert.equal(holdRow.amount, finalizedDeal.total_amount, "Escrow hold amount must match deal total_amount");

    const payouts = ledger.filter((l) => l.transaction_type === "payout_seller").reduce((sum, l) => sum + l.amount, 0);
    const refunds = ledger.filter((l) => l.transaction_type === "refund_buyer").reduce((sum, l) => sum + l.amount, 0);
    const fees = ledger.filter((l) => l.transaction_type === "platform_fee").reduce((sum, l) => sum + l.amount, 0);

    // Assert no negative values anywhere in ledger
    for (const row of ledger) {
      assert.ok(row.amount >= 0, `Ledger entry ${row.transaction_type} has negative amount: ${row.amount}`);
    }

    // Invariant: payouts + refunds + fees === held amount
    assert.equal(
      payouts + refunds + fees,
      finalizedDeal.total_amount,
      `Reconciliation discrepancy for #${finalizedDeal.code} (status=${finalizedDeal.status}, outcome=${finalizedDeal.outcome}, mode=${finalizedDeal.payment_mode}): ` +
      `payouts (${payouts}) + refunds (${refunds}) + fees (${fees}) !== total held (${finalizedDeal.total_amount})`
    );
  }

  async function cleanup(dealId) {
    if (dealId) {
      await q("delete from ledger where deal_id=$1", [dealId]);
      await q("delete from disputes where deal_id=$1", [dealId]);
      await q("delete from deal_events where deal_id=$1", [dealId]);
      await q("delete from deals where id=$1", [dealId]);
    }
  }

  const modes = ["delivery_only", "full_payment"];

  for (const mode of modes) {
    // 1. Status: released (via buyer confirmation)
    {
      let deal = await createAndFundDeal({ mode, price: 3000, charge: 100, returnCharge: 100 });
      try {
        deal = await applyShip(deal, "Pathao", "PA-REC-1");
        deal = await applyCourier(deal, "delivered");
        deal = await releaseToSeller(deal, "buyer_confirmed", "buyer");
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 2. Status: released (via auto-release countdown timeout)
    {
      let deal = await createAndFundDeal({ mode, price: 2500, charge: 120, returnCharge: 120 });
      try {
        deal = await applyShip(deal, "Steadfast", "SF-REC-2");
        deal = await applyCourier(deal, "delivered");
        deal = await releaseToSeller(deal, "auto_release_timeout", "system");
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 3. Status: released (via refused_at_door)
    {
      let deal = await createAndFundDeal({ mode, price: 4000, charge: 100, returnCharge: 100 });
      try {
        deal = await applyShip(deal, "RedX", "RX-REC-3");
        if (mode === "delivery_only") {
          deal = await applyCourier(deal, "refused");
          const pastTime = new Date(Date.now() - 36e5).toISOString();
          await q("update deals set auto_release_at=$1 where id=$2", [pastTime, deal.id]);
          await checkAllTimeouts();
        } else {
          deal = await applyCourier(deal, "refused");
        }
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 4. Status: refunded (via seller ship timeout)
    {
      let deal = await createAndFundDeal({ mode, price: 1800, charge: 80, returnCharge: 80 });
      try {
        const pastShipBy = new Date(Date.now() - 36e5).toISOString();
        await q("update deals set ship_by=$1 where id=$2", [pastShipBy, deal.id]);
        await checkAllTimeouts();
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 5. Status: refunded (via return_received)
    {
      let deal = await createAndFundDeal({ mode, price: 3200, charge: 100, returnCharge: 100 });
      try {
        deal = await applyShip(deal, "Pathao", "PA-REC-5");
        deal = await applyCourier(deal, "delivered");
        await q("update deals set status='return_requested' where id=$1", [deal.id]);
        await q("update deals set status='return_shipped' where id=$1", [deal.id]);
        deal = await one("select * from deals where id=$1", [deal.id]);
        await completeReturn(deal, "seller");
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 6. Status: refunded (via dispute upheld by admin)
    {
      let deal = await createAndFundDeal({ mode, price: 2800, charge: 100, returnCharge: 100 });
      try {
        deal = await applyShip(deal, "Steadfast", "SF-REC-6");
        deal = await applyCourier(deal, "delivered");
        const dispute = await one(
          `insert into disputes(deal_id, raised_by_phone, reason, category, status)
           values($1, $2, 'Item arrived broken', 'damaged', 'open') returning id`,
          [deal.id, deal.buyer_phone]
        );
        await q("update deals set status='disputed', auto_release_paused=1 where id=$1", [deal.id]);
        // Simulate dispute decide: upheld
        await transaction(async () => {
          await q("update disputes set status='upheld' where id=$1", [dispute.id]);
          await q("update deals set status='refunded', outcome='dispute_upheld' where id=$1", [deal.id]);
          await q(
            `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after, notes)
             values($1, 'refund_buyer', $2, $3, 0, 'Dispute upheld')`,
            [deal.id, deal.total_amount, deal.buyer_phone]
          );
        });
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 7. Status: released (via dispute rejected by admin)
    {
      let deal = await createAndFundDeal({ mode, price: 2800, charge: 100, returnCharge: 100 });
      try {
        deal = await applyShip(deal, "Steadfast", "SF-REC-7");
        deal = await applyCourier(deal, "delivered");
        const dispute = await one(
          `insert into disputes(deal_id, raised_by_phone, reason, category, status)
           values($1, $2, 'Buyer falsely claimed issue', 'other', 'open') returning id`,
          [deal.id, deal.buyer_phone]
        );
        await q("update deals set status='disputed', auto_release_paused=1 where id=$1", [deal.id]);
        // Simulate dispute decide: rejected
        await transaction(async () => {
          await q("update disputes set status='rejected' where id=$1", [dispute.id]);
          await q("update deals set status='released', outcome='dispute_rejected' where id=$1", [deal.id]);
          await q(
            `insert into ledger(deal_id, transaction_type, amount, balance_after, notes)
             values($1, 'payout_seller', $2, 0, 'Dispute rejected')`,
            [deal.id, deal.seller_payout]
          );
          await q(
            `insert into ledger(deal_id, transaction_type, amount, balance_after, notes)
             values($1, 'platform_fee', $2, 0, 'Fee')`,
            [deal.id, deal.fee_amount]
          );
        });
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 8. Status: released (via admin split resolution)
    {
      let deal = await createAndFundDeal({ mode, price: 5000, charge: 120, returnCharge: 120 });
      try {
        deal = await applyShip(deal, "Pathao", "PA-REC-8");
        deal = await applyCourier(deal, "delivered");
        await q("update deals set status='disputed', auto_release_paused=1 where id=$1", [deal.id]);
        deal = await one("select * from deals where id=$1", [deal.id]);
        const sellerShare = Math.floor(deal.total_amount / 2);
        const buyerShare = deal.total_amount - sellerShare;
        await adminSplitResolution(deal, sellerShare, buyerShare, "50-50 amicable split");
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 9. Status: refunded (via admin force refund)
    {
      let deal = await createAndFundDeal({ mode, price: 3500, charge: 100, returnCharge: 100 });
      try {
        await adminForceRefund(deal, "Admin issued refund due to logistics issue");
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }

    // 10. Status: released (via admin force release)
    {
      let deal = await createAndFundDeal({ mode, price: 3500, charge: 100, returnCharge: 100 });
      try {
        await adminForceRelease(deal, "Admin issued release after manual confirmation");
        await verifyReconciliation(deal.id);
      } finally {
        await cleanup(deal.id);
      }
    }
  }
});
