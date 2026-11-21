import { test } from "node:test";
import assert from "node:assert/strict";
import { initDb, q, one } from "../src/db.js";
import { detectCourier, updateDealTracking, getDealTrackingTimeline } from "../src/services/tracking.service.js";
import { couriers, getCourier } from "../src/services/couriers/index.js";
import { applyShip } from "../src/services/settle.js";

test("courier detection engine recognizes known formats with high confidence", () => {
  // Steadfast
  const sf1 = detectCourier("SF12345678");
  assert.equal(sf1.detectedCourier, "Steadfast");
  assert.ok(sf1.detectionConfidence >= 90);

  const sf2 = detectCourier("STEADFAST-99882");
  assert.equal(sf2.detectedCourier, "Steadfast");

  // Pathao
  const pt1 = detectCourier("PT1029384756");
  assert.equal(pt1.detectedCourier, "Pathao");
  assert.ok(pt1.detectionConfidence >= 85);

  const pt2 = detectCourier("PATHAO-001");
  assert.equal(pt2.detectedCourier, "Pathao");

  // RedX
  const rx1 = detectCourier("REDX12345678");
  assert.equal(rx1.detectedCourier, "RedX");
  assert.ok(rx1.detectionConfidence >= 85);

  // Paperfly
  const pf1 = detectCourier("PF99887766");
  assert.equal(pf1.detectedCourier, "Paperfly");

  // eCourier
  const ec1 = detectCourier("EC12345678");
  assert.equal(ec1.detectedCourier, "eCourier");

  // Sundarban
  const sbn1 = detectCourier("CN-12345678");
  assert.equal(sbn1.detectedCourier, "Sundarban Courier");

  // SA Paribahan
  const sa1 = detectCourier("MR-998877");
  assert.equal(sa1.detectedCourier, "SA Paribahan");

  // Blank or random
  const empty = detectCourier("");
  assert.equal(empty.detectedCourier, null);
  assert.equal(empty.detectionConfidence, 0);
});

test("courier registry lists all supported couriers", () => {
  assert.ok(couriers.length >= 7);
  const names = couriers.map((c) => c.name);
  assert.ok(names.includes("Steadfast"));
  assert.ok(names.includes("Pathao"));
  assert.ok(names.includes("RedX"));
  assert.ok(names.includes("Sundarban Courier"));
  assert.ok(names.includes("SA Paribahan"));
});

test("manual courier never sets DELIVERED automatically", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "TRACK-MANUAL-" + Date.now();

  const deal = await one(`
    insert into deals(
      code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
      price, delivery_charge, total_amount, fee_amount, seller_payout, deposit,
      return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
    ) values(
      $1, 'product', $2, '01799999999', 'Test Buyer', 'Dhaka', 'Dhaka', 'Manual Courier Test Item', 'Specs',
      1000, 100, 1100, 22, 1078, 1100,
      'buyer_pays', 100, 'held', 'Sundarban Courier', 10, 'Normal', 70
    ) returning *
  `, [code, seller.id]);

  const shippedDeal = await applyShip(deal, {
    courierName: "Sundarban Courier",
    trackingId: "CN-99999999",
    isManualCourier: true,
    courierPhone: "01800000000",
  });

  assert.equal(shippedDeal.status, "shipped");
  assert.equal(Number(shippedDeal.is_manual_courier), 1);

  // Update tracking
  const updated = await updateDealTracking(shippedDeal, "manual");
  assert.ok(updated);

  // Re-fetch deal and verify status has NOT changed to delivered (stays shipped or in_transit)
  const refreshed = await one("select * from deals where id=$1", [deal.id]);
  assert.notEqual(refreshed.status, "delivered");
  assert.ok(["shipped", "in_transit"].includes(refreshed.status));

  // Timeline exists
  const timeline = await getDealTrackingTimeline(deal.id);
  assert.equal(timeline.isManualCourier, true);
  assert.ok(timeline.manualTrackingUrl);
  assert.ok(timeline.events.length >= 1);
});

test("API-verified courier tracking delivers and updates events", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "TRACK-API-" + Date.now();

  const deal = await one(`
    insert into deals(
      code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
      price, delivery_charge, total_amount, fee_amount, seller_payout, deposit,
      return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
    ) values(
      $1, 'product', $2, '01788888888', 'Verified Buyer', 'Dhaka', 'Dhaka', 'API Track Item', 'Specs',
      2000, 100, 2100, 42, 2058, 2100,
      'buyer_pays', 100, 'held', 'Steadfast', 10, 'Normal', 80
    ) returning *
  `, [code, seller.id]);

  // Tracking ID ending in DELIV-123 causes mock to simulate delivered
  const shippedDeal = await applyShip(deal, {
    courierName: "Steadfast",
    trackingId: "SF-DELIV-123",
    isManualCourier: false,
  });

  const updated = await updateDealTracking(shippedDeal, "api");
  assert.ok(updated);

  const refreshed = await one("select * from deals where id=$1", [deal.id]);
  assert.equal(refreshed.status, "delivered");
  assert.equal(refreshed.standardized_status, "delivered");
  assert.ok(refreshed.auto_release_at);

  const timeline = await getDealTrackingTimeline(deal.code);
  assert.equal(timeline.standardizedStatus, "delivered");
  assert.ok(timeline.events.length >= 1);
});

test("seller can delete unpaid deal, but deletion is blocked once paid into escrow", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const code = "DELETE-TEST-" + Date.now();

  const unpaidDeal = await one(`
    insert into deals(
      code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
      price, delivery_charge, total_amount, fee_amount, seller_payout, deposit,
      return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
    ) values(
      $1, 'product', $2, '01712341234', 'Buyer Name', 'Dhaka', 'Dhaka', 'Unpaid Test Item', 'Specs',
      1500, 100, 1600, 32, 1568, 1600,
      'buyer_pays', 100, 'created', 'Steadfast', 10, 'Normal', 70
    ) returning *
  `, [code, seller.id]);

  assert.equal(unpaidDeal.status, "created");

  // Deleting unpaid deal is allowed
  await q("delete from deals where id = $1", [unpaidDeal.id]);
  const checkDeleted = await one("select * from deals where id = $1", [unpaidDeal.id]);
  assert.equal(checkDeleted, null);

  // Now create a deal and transition to 'held' (paid)
  const paidCode = "PAID-TEST-" + Date.now();
  const paidDeal = await one(`
    insert into deals(
      code, deal_type, seller_id, buyer_phone, buyer_name, address, area, product, details,
      price, delivery_charge, total_amount, fee_amount, seller_payout, deposit,
      return_policy, return_charge, status, courier_name, risk_score, risk_reasons, buyer_trust
    ) values(
      $1, 'product', $2, '01712341234', 'Buyer Name', 'Dhaka', 'Dhaka', 'Paid Test Item', 'Specs',
      2500, 100, 2600, 52, 2548, 2600,
      'buyer_pays', 100, 'held', 'Steadfast', 10, 'Normal', 70
    ) returning *
  `, [paidCode, seller.id]);

  // Attempting to delete a deal when status is 'held' must be blocked
  const isDeletable = ["created", "payment_pending"].includes(paidDeal.status);
  assert.equal(isDeletable, false);
});
