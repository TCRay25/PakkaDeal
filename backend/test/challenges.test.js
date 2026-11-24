import test from "node:test";
import assert from "node:assert/strict";
import { initDb, one, q } from "../src/db.js";
import { computeAmounts } from "../src/services/amounts.js";
import { isTrustedBuyer } from "../src/services/trust.js";
import { evaluateMismatchRules, executeMismatchDecision } from "../src/services/mismatch.js";
import { checkAllTimeouts, releaseToSeller } from "../src/services/settle.js";

test("Amounts per mode: computeAmounts canonical logic", () => {
  // 1. delivery_only base: held = max(charge + returnCharge, minDeposit [60])
  const res1 = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 5000,
    charge: 70,
    returnCharge: 70,
    feePercent: 1.0,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(res1.held_amount, 140);
  assert.equal(res1.cod_amount, 5000);
  assert.equal(res1.fee_amount, 10);
  assert.equal(res1.total_amount, 150);
  assert.equal(res1.seller_payout, 140);

  // When charge + returnCharge < minDeposit (e.g. 20 + 20 = 40 < 60)
  const res2 = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 3000,
    charge: 20,
    returnCharge: 20,
    feePercent: 1.0,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(res2.held_amount, 60);
  assert.equal(res2.cod_amount, 3000);
  assert.equal(res2.total_amount, 70);

  // 2. full_payment: held = price + charge, cod = 0
  const res3 = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 5000,
    charge: 100,
    feePercent: 1.0,
    feeMin: 10,
  });
  assert.equal(res3.held_amount, 5100);
  assert.equal(res3.cod_amount, 0);
  assert.equal(res3.fee_amount, 51);
  assert.equal(res3.total_amount, 5151);

  // 3. Rentals and Services: forced to full_payment with cod = 0
  const resRent = computeAmounts({
    dealType: "rental",
    mode: "delivery_only",
    price: 20000,
  });
  assert.equal(resRent.held_amount, 20000);
  assert.equal(resRent.cod_amount, 0);
});

test("Trusted Buyer Reduced Deposit: discount applied ONLY when eligible", async () => {
  await initDb();

  // Test buyer trust validation
  const eligiblePhone = "01799881122";
  await q("delete from buyer_stats where phone=$1", [eligiblePhone]);
  await q("delete from buyer_liabilities where phone=$1", [eligiblePhone]);
  await q(
    `insert into buyer_stats(phone, delivered, refused, disputes, trust_score)
     values($1, 5, 0, 0, 92)`,
    [eligiblePhone]
  );

  const trustCheckEligible = await isTrustedBuyer(eligiblePhone);
  assert.equal(trustCheckEligible.trusted, true);
  assert.equal(trustCheckEligible.trustScore, 92);
  assert.equal(trustCheckEligible.completedCount, 5);

  // Discount applies when eligible AND seller offers it
  const discRes = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 10000,
    charge: 100,
    returnCharge: 100,
    trustedDiscountPercent: 50,
    isBuyerTrusted: true,
  });
  // base deposit = 200; with 50% discount = 100 (floor >= 30)
  assert.equal(discRes.held_amount, 100);
  assert.equal(discRes.total_amount, 110);

  // Floor of 30 BDT applies even on very high discount
  const floorRes = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 1000,
    charge: 30,
    returnCharge: 30,
    minDeposit: 60,
    trustedDiscountPercent: 70,
    isBuyerTrusted: true,
  });
  // base = 60; 60 * (1 - 0.70) = 18; floor is 30 BDT
  assert.equal(floorRes.held_amount, 30);

  // Ineligible buyer: low trust score
  const lowTrustPhone = "01799881133";
  await q("delete from buyer_stats where phone=$1", [lowTrustPhone]);
  await q(
    `insert into buyer_stats(phone, delivered, refused, disputes, trust_score)
     values($1, 5, 0, 0, 75)`,
    [lowTrustPhone]
  );
  const trustCheckLow = await isTrustedBuyer(lowTrustPhone);
  assert.equal(trustCheckLow.trusted, false);

  // Ineligible buyer: open liability
  await q("delete from buyer_liabilities where phone=$1", [eligiblePhone]);
  await q(
    `insert into buyer_liabilities(phone, amount, status, reason)
     values($1, 100, 'open', 'Unpaid courier refusal shortfall')`,
    [eligiblePhone]
  );
  const trustCheckLiab = await isTrustedBuyer(eligiblePhone);
  assert.equal(trustCheckLiab.trusted, false);
  assert.equal(trustCheckLiab.openLiabilitiesCount, 1);
  await q("delete from buyer_liabilities where phone=$1", [eligiblePhone]);
});

test("Instalment Schedule & Expiry Rules", async () => {
  await initDb();

  const total = 310;
  const held = 300;
  const fee = 10;

  // 1st instalment >= 40% of held deposit + fee
  const firstHeld = Math.ceil(held * 0.4); // 120
  const inst1Amount = firstHeld + fee; // 130
  const remaining = total - inst1Amount; // 180
  const inst2Amount = Math.floor(remaining / 2); // 90
  const inst3Amount = remaining - inst2Amount; // 90

  assert.equal(inst1Amount + inst2Amount + inst3Amount, total);
  assert.ok(inst1Amount >= held * 0.4 + fee);

  // Deal creation with installments
  const uniqueCode = "PK-TEST-INST-" + Date.now().toString(36).toUpperCase();
  const seller = await one("select id from users where role='seller' limit 1");
  const dRow = await one(
    `insert into deals(code, product, details, deal_type, payment_mode, price, delivery_charge, total_amount, held_amount, fee_amount, seller_payout, status, seller_id, buyer_phone, buyer_name, address)
     values($1, 'Test Product', 'Details for test', 'product', 'delivery_only', 10000, 150, $2, $3, $4, $3, 'created', $5, '01711112222', 'Tester', 'Dhaka')
     returning id`,
    [uniqueCode, total, held, fee, seller.id]
  );

  const pastDue = new Date(Date.now() - 36e5).toISOString();
  // Insert inst 1 confirmed, inst 2 expired
  await q(
    `insert into deal_installments(deal_id, seq, amount, due_at, status)
     values($1, 1, $2, $3, 'confirmed')`,
    [dRow.id, inst1Amount, pastDue]
  );
  await q(
    `insert into ledger(deal_id, transaction_type, amount, balance_after)
     values($1, 'hold', $2, $2)`,
    [dRow.id, inst1Amount]
  );

  await q(
    `insert into deal_installments(deal_id, seq, amount, due_at, status)
     values($1, 2, $2, $3, 'pending')`,
    [dRow.id, inst2Amount, pastDue]
  );

  // Run timeout checker: expired installment before shipping cancels and refunds
  await checkAllTimeouts();

  const updatedDeal = await one("select * from deals where id=$1", [dRow.id]);
  assert.equal(updatedDeal.status, "cancelled");

  const ledgerRefund = await one(
    "select * from ledger where deal_id=$1 and transaction_type='refund_buyer'",
    [dRow.id]
  );
  assert.ok(ledgerRefund);
  assert.equal(Number(ledgerRefund.amount), inst1Amount);
});

test("Mismatch AI & Rule Engine: uphold, reject, admin_review", () => {
  // Case 1: Match = different AND confidence >= 85 AND label present AND no reused photo -> uphold
  const ruleUphold = evaluateMismatchRules({
    aiResult: {
      match: "different",
      confidence: 90,
      differences: ["Received soap bar instead of phone"],
      flags: [],
    },
    hasLabelPhoto: true,
    hasReusedPhoto: false,
    sellerResponseExpired: false,
  });
  assert.equal(ruleUphold.outcome, "uphold");

  // Case 2: Match = same AND confidence >= 85 -> reject
  const ruleReject = evaluateMismatchRules({
    aiResult: {
      match: "same",
      confidence: 88,
      differences: [],
      flags: [],
    },
    hasLabelPhoto: true,
    hasReusedPhoto: false,
    sellerResponseExpired: false,
  });
  assert.equal(ruleReject.outcome, "reject");

  // Case 3: Match = uncertain or confidence < 85 or reused photo -> admin_review
  const ruleReviewUncertain = evaluateMismatchRules({
    aiResult: {
      match: "uncertain",
      confidence: 50,
      differences: [],
      flags: [],
    },
    hasLabelPhoto: true,
    hasReusedPhoto: false,
  });
  assert.equal(ruleReviewUncertain.outcome, "admin_review");

  const ruleReviewReused = evaluateMismatchRules({
    aiResult: {
      match: "different",
      confidence: 95,
      differences: ["Different item"],
      flags: [],
    },
    hasLabelPhoto: true,
    hasReusedPhoto: true, // Reused photo flag!
  });
  assert.equal(ruleReviewReused.outcome, "admin_review");
});

test("Settlement & Liabilities: payouts never exceed held deposit and seller liability is recorded on upheld mismatch", async () => {
  await initDb();

  const seller = await one("select id, phone from users where role='seller' limit 1");
  const uniqueCode = "PK-TEST-SETTLE-" + Date.now().toString(36).toUpperCase();

  // Create a delivery_only deal: product price = 8000, held deposit = 200, fee = 10, total = 210
  const dRow = await one(
    `insert into deals(code, product, details, deal_type, payment_mode, price, delivery_charge, return_charge, total_amount, held_amount, fee_amount, seller_payout, status, seller_id, buyer_phone, buyer_name, address)
     values($1, 'Test Product', 'Details for test', 'product', 'delivery_only', 8000, 100, 100, 210, 200, 10, 200, 'delivered', $2, '01700998877', 'Buyer Tester', 'Dhaka')
     returning *`,
    [uniqueCode, seller.id]
  );

  // Escrow held in ledger
  await q(
    `insert into ledger(deal_id, transaction_type, amount, party_phone, balance_after)
     values($1, 'hold', 210, $2, 210)`,
    [dRow.id, dRow.buyer_phone]
  );

  // Execute uphold mismatch decision
  await executeMismatchDecision({
    deal: dRow,
    outcome: "uphold",
    rule: "RULE_AI_UPHELD_MISMATCH",
    aiResult: {
      match: "different",
      confidence: 90,
      differences: ["Item is mismatched"],
    },
  });

  // Verify refund never exceeds held amount
  const refunds = await q("select * from ledger where deal_id=$1 and transaction_type='refund_buyer'", [dRow.id]);
  const totalRefund = refunds.reduce((s, r) => s + Number(r.amount), 0);
  assert.equal(totalRefund, 200); // exactly the held delivery charge
  assert.ok(totalRefund <= Number(dRow.held_amount));

  // Verify seller liability was created for the product price
  const liability = await one("select * from seller_liabilities where deal_id=$1", [dRow.id]);
  assert.ok(liability);
  assert.equal(Number(liability.amount), 8000);
  assert.equal(liability.status, "open");

  // Clean up
  await q("delete from seller_liabilities where deal_id=$1", [dRow.id]);
  await q("delete from ledger where deal_id=$1", [dRow.id]);
  await q("delete from deals where id=$1", [dRow.id]);
});
