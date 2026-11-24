import { q, one, initDb } from "../src/db.js";
import { computeAmounts } from "../src/services/amounts.js";
import { seed50MockDeals } from "../src/services/mockDeals.js";

async function verify() {
  await initDb();

  // If mock deals are not yet seeded or need upgrade, run seed50MockDeals({ force: true })
  let countRow = await one("select count(*) as cnt from deals where code like 'PK-MOCK-%'");
  let count = Number(countRow?.cnt || 0);
  const delivOnlyCount = Number(
    (await one("select count(*) as cnt from deals where code like 'PK-MOCK-%' and payment_mode='delivery_only'"))?.cnt || 0
  );

  const shouldForce = process.argv.includes("--force") || count < 50 || delivOnlyCount < 20;
  if (shouldForce) {
    console.log("Seeding / refreshing 50 mock deals before verification...");
    await seed50MockDeals({ force: true });
    countRow = await one("select count(*) as cnt from deals where code like 'PK-MOCK-%'");
    count = Number(countRow?.cnt || 0);
  }

  const failures = [];
  function assert(condition, message) {
    if (!condition) {
      failures.push(message);
      console.error(`[FAIL] ${message}`);
    }
  }

  // Fetch all mock deals
  const deals = await q("select * from deals where code like 'PK-MOCK-%' order by code");
  console.log(`Verifying ${deals.length} mock deals...`);

  assert(deals.length >= 50, `Expected at least 50 mock deals, found ${deals.length}`);

  // 1. Payment mode distribution rules:
  // Rentals and services must be full_payment with cod_amount = 0
  const nonProductDeals = deals.filter((d) => d.deal_type !== "product");
  for (const d of nonProductDeals) {
    assert(
      d.payment_mode === "full_payment",
      `${d.code} (${d.deal_type}) must have payment_mode='full_payment', found '${d.payment_mode}'`
    );
    assert(
      Number(d.cod_amount) === 0,
      `${d.code} (${d.deal_type}) must have cod_amount=0, found ${d.cod_amount}`
    );
  }

  // Product deals: ~70% delivery_only with cod_amount = price and total_amount = held + fee
  const productDeals = deals.filter((d) => d.deal_type === "product");
  const deliveryOnlyProducts = productDeals.filter((d) => d.payment_mode === "delivery_only");
  const fullPaymentProducts = productDeals.filter((d) => d.payment_mode === "full_payment");

  const deliveryOnlyPercent = Math.round((deliveryOnlyProducts.length / productDeals.length) * 100);
  console.log(`Product deals: total ${productDeals.length}, delivery_only ${deliveryOnlyProducts.length} (${deliveryOnlyPercent}%), full_payment ${fullPaymentProducts.length}`);

  assert(
    deliveryOnlyPercent >= 65 && deliveryOnlyPercent <= 75,
    `Expected ~70% of product deals to be delivery_only, found ${deliveryOnlyPercent}% (${deliveryOnlyProducts.length}/${productDeals.length})`
  );
  assert(
    fullPaymentProducts.length >= 2,
    `Expected at least 2-3 product deals to be full_payment, found ${fullPaymentProducts.length}`
  );

  for (const d of deliveryOnlyProducts) {
    assert(
      Number(d.cod_amount) === Number(d.price),
      `${d.code} delivery_only cod_amount (${d.cod_amount}) must equal price (${d.price})`
    );
  }

  // 2. Dynamic amounts rule: check that each deal's total_amount matches computeAmounts()
  for (const d of deals) {
    const expected = computeAmounts({
      dealType: d.deal_type,
      mode: d.payment_mode,
      price: d.price,
      charge: d.delivery_charge || 0,
      returnCharge: d.return_charge !== undefined ? d.return_charge : (d.delivery_charge || 0),
      feePercent: 1.0,
      feeMin: 10,
      minDeposit: 60,
      trustedDiscountPercent: Number(d.trusted_discount_percent || 0),
      isBuyerTrusted: !!d.is_buyer_trusted,
    });

    assert(
      Number(d.total_amount) === expected.total_amount,
      `${d.code} total_amount (${d.total_amount}) does not match computeAmounts (${expected.total_amount})`
    );
    assert(
      Number(d.fee_amount) === expected.fee_amount,
      `${d.code} fee_amount (${d.fee_amount}) does not match computeAmounts (${expected.fee_amount})`
    );
    assert(
      Number(d.seller_payout) === expected.seller_payout,
      `${d.code} seller_payout (${d.seller_payout}) does not match computeAmounts (${expected.seller_payout})`
    );
    assert(
      Number(d.cod_amount) === expected.cod_amount,
      `${d.code} cod_amount (${d.cod_amount}) does not match computeAmounts (${expected.cod_amount})`
    );
  }

  // 3. Required Demo Scenarios: (a) - (f)
  // (a) Trusted buyer with reduced deposit
  const demoA = deals.find((d) => d.code === "PK-MOCK-A-TRUSTED");
  assert(demoA, "Missing demo scenario (a): PK-MOCK-A-TRUSTED");
  if (demoA) {
    assert(Number(demoA.is_buyer_trusted) === 1, "Demo (a) must have is_buyer_trusted=1");
    assert(Number(demoA.trusted_discount_applied) === 1, "Demo (a) must have trusted_discount_applied=1");
    assert(Number(demoA.trusted_discount_percent) === 50, "Demo (a) must have trusted_discount_percent=50");
    const expA = computeAmounts({
      dealType: "product",
      mode: "delivery_only",
      price: demoA.price,
      charge: demoA.delivery_charge,
      returnCharge: demoA.return_charge,
      feePercent: 1.0,
      feeMin: 10,
      minDeposit: 60,
      trustedDiscountPercent: 50,
      isBuyerTrusted: true,
    });
    assert(Number(demoA.total_amount) === expA.total_amount, `Demo (a) total_amount (${demoA.total_amount}) !== expected (${expA.total_amount})`);
  }

  // (b) 3-instalment deal
  const demoB = deals.find((d) => d.code === "PK-MOCK-B-3INSTAL");
  assert(demoB, "Missing demo scenario (b): PK-MOCK-B-3INSTAL");
  if (demoB) {
    const instB = await q("select * from deal_installments where deal_id=$1 order by seq", [demoB.id]);
    assert(instB.length === 3, `Demo (b) must have 3 installments, found ${instB.length}`);
    assert(demoB.status === "partially_funded", `Demo (b) status must be partially_funded, found ${demoB.status}`);
  }

  // (c) Missed instalment with refund
  const demoC = deals.find((d) => d.code === "PK-MOCK-C-MISSED-INST");
  assert(demoC, "Missing demo scenario (c): PK-MOCK-C-MISSED-INST");
  if (demoC) {
    assert(demoC.status === "cancelled", `Demo (c) status must be cancelled, found ${demoC.status}`);
    const ledgerC = await q("select * from ledger where deal_id=$1", [demoC.id]);
    const holdsC = ledgerC.filter((l) => l.transaction_type === "hold").reduce((s, l) => s + Number(l.amount), 0);
    const refundsC = ledgerC.filter((l) => l.transaction_type === "refund_buyer").reduce((s, l) => s + Number(l.amount), 0);
    assert(holdsC > 0 && holdsC === refundsC, `Demo (c) holds (${holdsC}) must equal refunds (${refundsC})`);
  }

  // (d) Mismatch claim upheld
  const demoD = deals.find((d) => d.code === "PK-MOCK-D-MISMATCH-UPHELD");
  assert(demoD, "Missing demo scenario (d): PK-MOCK-D-MISMATCH-UPHELD");
  if (demoD) {
    assert(demoD.mismatch_status === "upheld", `Demo (d) mismatch_status must be upheld, found ${demoD.mismatch_status}`);
    assert(demoD.status === "refunded", `Demo (d) status must be refunded, found ${demoD.status}`);
    const sellerLiab = await one("select * from seller_liabilities where deal_id=$1", [demoD.id]);
    assert(sellerLiab && Number(sellerLiab.amount) === Number(demoD.price), `Demo (d) must have seller liability equal to price (${demoD.price})`);
  }

  // (e) Mismatch claim rejected
  const demoE = deals.find((d) => d.code === "PK-MOCK-E-MISMATCH-REJECTED");
  assert(demoE, "Missing demo scenario (e): PK-MOCK-E-MISMATCH-REJECTED");
  if (demoE) {
    assert(demoE.mismatch_status === "rejected", `Demo (e) mismatch_status must be rejected, found ${demoE.mismatch_status}`);
    assert(demoE.status === "released", `Demo (e) status must be released, found ${demoE.status}`);
  }

  // (f) Refused parcel with compensation
  const demoF = deals.find((d) => d.code === "PK-MOCK-F-REFUSED");
  assert(demoF, "Missing demo scenario (f): PK-MOCK-F-REFUSED");
  if (demoF) {
    assert(demoF.outcome === "refused_at_door" || demoF.courier_status === "refused", `Demo (f) must be refused at door`);
    const ledgerF = await q("select * from ledger where deal_id=$1", [demoF.id]);
    const payoutsF = ledgerF.filter((l) => l.transaction_type === "payout_seller").reduce((s, l) => s + Number(l.amount), 0);
    const expectedComp = Math.min(Number(demoF.held_amount), Number(demoF.delivery_charge) + Number(demoF.return_charge));
    assert(payoutsF === expectedComp, `Demo (f) seller compensation (${payoutsF}) must equal expected (${expectedComp})`);
  }

  const deliveredDemo = deals.find((d) => d.status === "delivered");
  assert(deliveredDemo, "Missing delivered demo deal (status='delivered')");

  const timeoutDemo = deals.find(
    (d) => d.status === "refunded" && d.outcome === "seller_ship_timeout"
  );
  assert(timeoutDemo, "Missing seller-timeout refund demo deal (status='refunded', outcome='seller_ship_timeout')");

  const disputeDemo = await one(
    `select dis.id, dis.category, dis.ai_recommendation, d.code
     from disputes dis
     join deals d on dis.deal_id=d.id
     where d.code like 'PK-MOCK-%' and dis.status='open' and dis.ai_recommendation='uphold'`
  );
  assert(disputeDemo, "Missing seller-fault dispute demo with open status and uphold recommendation");

  // 4. Ledger reconciliation for every deal
  const fundedStatuses = [
    "held",
    "shipped",
    "in_transit",
    "delivered",
    "released",
    "refunded",
    "disputed",
    "return_requested",
    "return_shipped",
    "return_received",
  ];

  for (const d of deals) {
    const ledgerRows = await q("select * from ledger where deal_id=$1", [d.id]);

    if (d.status === "partially_funded") {
      const instRows = await q("select * from deal_installments where deal_id=$1 and status='confirmed'", [d.id]);
      const expectedHold = instRows.reduce((s, r) => s + Number(r.amount), 0);
      const actualHold = ledgerRows.filter((l) => l.transaction_type === "hold").reduce((s, l) => s + Number(l.amount), 0);
      assert(
        actualHold === expectedHold,
        `${d.code} (partially_funded) ledger hold (${actualHold}) must equal confirmed installments (${expectedHold})`
      );
    } else if (d.status === "cancelled") {
      const holds = ledgerRows.filter((l) => l.transaction_type === "hold").reduce((s, l) => s + Number(l.amount), 0);
      const refunds = ledgerRows.filter((l) => l.transaction_type === "refund_buyer").reduce((s, l) => s + Number(l.amount), 0);
      assert(
        holds === refunds,
        `${d.code} (cancelled) holds (${holds}) must equal refunds (${refunds})`
      );
    } else if (d.status === "created" || d.status === "payment_pending") {
      assert(
        ledgerRows.length === 0,
        `${d.code} (${d.status}) must have no ledger rows, found ${ledgerRows.length}`
      );
    } else if (fundedStatuses.includes(d.status)) {
      // Must have hold row equal to total_amount
      const holdRows = ledgerRows.filter((l) => l.transaction_type === "hold");
      assert(
        holdRows.length >= 1,
        `${d.code} status='${d.status}' is funded but has no 'hold' ledger entry`
      );
      const holdTotal = holdRows.reduce((sum, l) => sum + Number(l.amount), 0);
      assert(
        holdTotal === Number(d.total_amount),
        `${d.code} ledger hold amount (${holdTotal}) does not match total_amount (${d.total_amount})`
      );
    }

    if (d.status === "released") {
      // Final status released: payout_seller + platform_fee (+ refund_buyer if refusal remainder) === total_amount
      const payouts = ledgerRows.filter((l) => l.transaction_type === "payout_seller");
      const fees = ledgerRows.filter((l) => l.transaction_type === "platform_fee");
      const refunds = ledgerRows.filter((l) => l.transaction_type === "refund_buyer");

      const payoutTotal = payouts.reduce((sum, l) => sum + Number(l.amount), 0);
      const feeTotal = fees.reduce((sum, l) => sum + Number(l.amount), 0);
      const refundTotal = refunds.reduce((sum, l) => sum + Number(l.amount), 0);
      const totalSettled = payoutTotal + feeTotal + refundTotal;

      assert(
        totalSettled === Number(d.total_amount),
        `${d.code} (released) ledger settlement (${totalSettled}: payout=${payoutTotal}, fee=${feeTotal}, refund=${refundTotal}) does not equal total_amount (${d.total_amount})`
      );
    }

    if (d.status === "refunded") {
      // Final status refunded: refund_buyer (+ payout_seller + fee if return deduction or upheld claim) === total_amount
      const refunds = ledgerRows.filter((l) => l.transaction_type === "refund_buyer");
      const payouts = ledgerRows.filter((l) => l.transaction_type === "payout_seller");
      const fees = ledgerRows.filter((l) => l.transaction_type === "platform_fee");

      const refundTotal = refunds.reduce((sum, l) => sum + Number(l.amount), 0);
      const payoutTotal = payouts.reduce((sum, l) => sum + Number(l.amount), 0);
      const feeTotal = fees.reduce((sum, l) => sum + Number(l.amount), 0);
      const totalSettled = refundTotal + payoutTotal + feeTotal;

      assert(
        totalSettled === Number(d.total_amount),
        `${d.code} (refunded) ledger settlement (${totalSettled}: refund=${refundTotal}, payout=${payoutTotal}, fee=${feeTotal}) does not equal total_amount (${d.total_amount})`
      );
    }

    if (d.status === "disputed") {
      // In disputed status: money is frozen, no payouts or refunds settled yet
      const payouts = ledgerRows.filter((l) => l.transaction_type === "payout_seller");
      const refunds = ledgerRows.filter((l) => l.transaction_type === "refund_buyer");
      assert(
        payouts.length === 0 && refunds.length === 0,
        `${d.code} (disputed) has premature payouts or refunds while dispute is pending`
      );
    }
  }

  // Also verify initial demo deals from db.js (PK-PROD-*, PK-RENT-*, PK-SERV-*) if present
  const demoDeals = await q("select * from deals where code like 'PK-PROD-%' or code like 'PK-RENT-%' or code like 'PK-SERV-%' order by code");
  if (demoDeals.length > 0) {
    console.log(`Verifying ${demoDeals.length} initial demo deals from db.js...`);
    for (const d of demoDeals) {
      const expected = computeAmounts({
        dealType: d.deal_type,
        mode: d.payment_mode,
        price: d.price,
        charge: d.delivery_charge || 0,
        returnCharge: d.return_charge !== undefined ? d.return_charge : (d.delivery_charge || 0),
        feePercent: 1.0,
        feeMin: 10,
        minDeposit: 60,
      });

      assert(
        Number(d.total_amount) === expected.total_amount,
        `${d.code} total_amount (${d.total_amount}) does not match computeAmounts (${expected.total_amount})`
      );

      const ledgerRows = await q("select * from ledger where deal_id=$1", [d.id]);
      if (fundedStatuses.includes(d.status)) {
        const holdRows = ledgerRows.filter((l) => l.transaction_type === "hold");
        assert(holdRows.length >= 1, `${d.code} funded deal must have 'hold' ledger entry`);
        const holdTotal = holdRows.reduce((sum, l) => sum + Number(l.amount), 0);
        assert(holdTotal === Number(d.total_amount), `${d.code} hold (${holdTotal}) !== total_amount (${d.total_amount})`);
      }
      if (d.status === "released") {
        const payouts = ledgerRows.filter((l) => l.transaction_type === "payout_seller");
        const fees = ledgerRows.filter((l) => l.transaction_type === "platform_fee");
        const refunds = ledgerRows.filter((l) => l.transaction_type === "refund_buyer");
        const totalSettled = payouts.reduce((s, l) => s + Number(l.amount), 0) + fees.reduce((s, l) => s + Number(l.amount), 0) + refunds.reduce((s, l) => s + Number(l.amount), 0);
        assert(totalSettled === Number(d.total_amount), `${d.code} released settlement (${totalSettled}) !== total_amount (${d.total_amount})`);
      }
      if (d.status === "refunded") {
        const payouts = ledgerRows.filter((l) => l.transaction_type === "payout_seller");
        const fees = ledgerRows.filter((l) => l.transaction_type === "platform_fee");
        const refunds = ledgerRows.filter((l) => l.transaction_type === "refund_buyer");
        const totalSettled = payouts.reduce((s, l) => s + Number(l.amount), 0) + fees.reduce((s, l) => s + Number(l.amount), 0) + refunds.reduce((s, l) => s + Number(l.amount), 0);
        assert(totalSettled === Number(d.total_amount), `${d.code} refunded settlement (${totalSettled}) !== total_amount (${d.total_amount})`);
      }
    }
  }

  // Print summary breakdown
  const summary = await q("select status, count(id) as count from deals where code like 'PK-MOCK-%' group by status order by count desc");
  const ledger = await q("select l.transaction_type, count(l.id) as count, sum(l.amount) as total_bdt from ledger l join deals d on l.deal_id=d.id where d.code like 'PK-MOCK-%' group by l.transaction_type");
  const disputes = await q("select d.code, dis.category, dis.ai_recommendation, substr(dis.reason, 1, 40) as reason from disputes dis join deals d on dis.deal_id=d.id where d.code like 'PK-MOCK-%'");

  console.log("\n=== 50 MOCK DEALS BREAKDOWN BY PHASE ===");
  console.table(summary);

  console.log("\n=== DISPUTES IN ADMIN QUEUE ===");
  console.table(disputes);

  console.log("\n=== FINANCIAL LEDGER SUMMARY (BDT) ===");
  console.table(ledger);

  if (failures.length > 0) {
    console.error(`\nFAILED: ${failures.length} reconciliation assertions failed!`);
    for (const f of failures) {
      console.error(` - ${f}`);
    }
    process.exit(1);
  }

  console.log("\nSUCCESS: All mock deals, payment modes, and financial ledger entries reconciled 100%!");
  process.exit(0);
}

verify().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(1);
});
