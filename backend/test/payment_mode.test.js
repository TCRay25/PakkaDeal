import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { initDb, one, q } from "../src/db.js";
import { computeAmounts } from "../src/services/amounts.js";
import dealRoutes from "../src/routes/deals.js";
import { makeToken } from "../src/http.js";

test("amounts.js: computeAmounts strictly implements all payment mode rules", () => {
  // 1. Rental/Service: always full_payment: held = price, cod = 0
  const rentalAmounts = computeAmounts({
    dealType: "rental",
    mode: "delivery_only", // must be ignored/forced to full_payment
    price: 15000,
    charge: 500, // ignored for rental
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(rentalAmounts.held_amount, 15000);
  assert.equal(rentalAmounts.cod_amount, 0);
  assert.equal(rentalAmounts.fee_amount, 150); // 1% of 15000
  assert.equal(rentalAmounts.total_amount, 15150);
  assert.equal(rentalAmounts.seller_payout, 15000);

  const serviceAmounts = computeAmounts({
    dealType: "service",
    price: 800,
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(serviceAmounts.held_amount, 800);
  assert.equal(serviceAmounts.cod_amount, 0);
  assert.equal(serviceAmounts.fee_amount, 10); // max(10, round(8)) = 10
  assert.equal(serviceAmounts.total_amount, 810);
  assert.equal(serviceAmounts.seller_payout, 800);

  // 2. Product + full_payment: held = price + charge, cod = 0
  const prodFull = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 2500,
    charge: 120,
    returnCharge: 120,
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(prodFull.held_amount, 2620); // 2500 + 120
  assert.equal(prodFull.cod_amount, 0);
  assert.equal(prodFull.fee_amount, 26); // round(2620 * 0.01) = 26
  assert.equal(prodFull.total_amount, 2646);
  assert.equal(prodFull.seller_payout, 2620);

  // 3. Product + delivery_only: held = max(charge + returnCharge, minDeposit), cod = price
  // Case A: charge + returnCharge > minDeposit
  const prodDeliveryA = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 3000,
    charge: 100,
    returnCharge: 80,
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(prodDeliveryA.held_amount, 180); // 100 + 80 = 180 (> 60)
  assert.equal(prodDeliveryA.cod_amount, 3000); // COD collected at door
  assert.equal(prodDeliveryA.fee_amount, 10); // max(10, round(1.8)) = 10
  assert.equal(prodDeliveryA.total_amount, 190); // 180 + 10
  assert.equal(prodDeliveryA.seller_payout, 180);

  // Case B: charge + returnCharge < minDeposit (falls back to minDeposit)
  const prodDeliveryB = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 500,
    charge: 20,
    returnCharge: 20,
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(prodDeliveryB.held_amount, 60); // max(40, 60) = 60
  assert.equal(prodDeliveryB.cod_amount, 500);
  assert.equal(prodDeliveryB.fee_amount, 10); // max(10, round(0.6)) = 10
  assert.equal(prodDeliveryB.total_amount, 70); // 60 + 10
  assert.equal(prodDeliveryB.seller_payout, 60);

  // Case C: charge = 0, returnCharge = 0 in delivery_only -> minimum deposit applies
  const prodDeliveryZero = computeAmounts({
    dealType: "product",
    mode: "delivery_only",
    price: 2500,
    charge: 0,
    returnCharge: 0,
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(prodDeliveryZero.held_amount, 60); // max(0, 60) = 60
  assert.equal(prodDeliveryZero.cod_amount, 2500); // courier collects product price
  assert.equal(prodDeliveryZero.fee_amount, 10); // max(10, round(60 * 0.01)) = 10
  assert.equal(prodDeliveryZero.total_amount, 70); // 60 + 10
  assert.equal(prodDeliveryZero.seller_payout, 60);

  // Case D: charge = 0 in full_payment -> held = price, cod = 0
  const prodFullZero = computeAmounts({
    dealType: "product",
    mode: "full_payment",
    price: 4000,
    charge: 0,
    returnCharge: 0,
    feePercent: 1,
    feeMin: 10,
    minDeposit: 60,
  });
  assert.equal(prodFullZero.held_amount, 4000); // 4000 + 0
  assert.equal(prodFullZero.cod_amount, 0);
  assert.equal(prodFullZero.fee_amount, 40); // 4000 * 0.01 = 40
  assert.equal(prodFullZero.total_amount, 4040); // 4000 + 40
  assert.equal(prodFullZero.seller_payout, 4000);
});

async function getOrCreateTestUser(phone, name, role = "buyer") {
  let u = await one("select * from users where phone=$1", [phone]);
  if (!u) {
    u = await one(
      "insert into users(phone, name, role, bkash_number, bkash_verified) values($1, $2, $3, $4, 1) returning *",
      [phone, name, role, phone]
    );
  }
  return u;
}

test("POST /deals: defaults to delivery_only, computes amounts on server, rejects delivery_only for non-product", async () => {
  await initDb();

  const seller = await getOrCreateTestUser("01711223344", "Rahim Chowdhury", "seller");
  const buyer = await getOrCreateTestUser("01755667788", "Nusrat Jahan", "buyer");

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeader = (u) => ({ Authorization: `Bearer ${makeToken(u)}` });

  let dealId1 = null;
  let dealId2 = null;

  try {
    // 1. Create product deal without specifying payment_mode -> defaults to delivery_only
    const res1 = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        product: "Wireless Earbuds",
        price: 2000,
        delivery_charge: 100,
        return_charge: 100,
        address: "Banani Road 11, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
        // client-sent manipulated amounts must be ignored
        total_amount: 999999,
        fee_amount: 0,
      }),
    });
    assert.equal(res1.status, 201);
    const deal1 = await res1.json();
    dealId1 = deal1.id;

    assert.equal(deal1.payment_mode, "delivery_only");
    assert.equal(deal1.cod_amount, 2000); // courier collects product price
    assert.equal(deal1.fee_amount, 10); // max(10, round(200 * 0.01)) = 10
    assert.equal(deal1.total_amount, 210); // held (200) + fee (10)
    assert.equal(deal1.seller_payout, 200);

    // 2. Reject delivery_only for rental/service deal
    const resRentalReject = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        deal_type: "rental",
        payment_mode: "delivery_only",
        product: "Apartment Sublet",
        price: 15000,
        address: "Dhanmondi 9A, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resRentalReject.status, 400);
    const errRental = await resRentalReject.json();
    assert.match(errRental.detail, /delivery-only/i);

    // 3. Create service deal -> forced to full_payment
    const resService = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        deal_type: "service",
        product: "Logo Design Service",
        price: 5000,
        address: "Online Remote",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resService.status, 201);
    const deal2 = await resService.json();
    dealId2 = deal2.id;
    assert.equal(deal2.payment_mode, "full_payment");
    assert.equal(deal2.cod_amount, 0);
    assert.equal(deal2.total_amount, 5050);

    // 4. Create product deal with charge = 0 in delivery_only -> minimum delivery deposit (60) applies
    const resZeroDeliv = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        product: "Free Shipping T-Shirt",
        price: 1200,
        delivery_charge: 0,
        return_charge: 0,
        payment_mode: "delivery_only",
        address: "Dhanmondi, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resZeroDeliv.status, 201);
    const dealZeroDeliv = await resZeroDeliv.json();
    assert.equal(dealZeroDeliv.payment_mode, "delivery_only");
    assert.equal(dealZeroDeliv.cod_amount, 1200);
    assert.equal(dealZeroDeliv.seller_payout, 60, "Charge = 0 in delivery_only must enforce min_delivery_deposit = 60");
    assert.equal(dealZeroDeliv.fee_amount, 10, "Minimum platform fee 10 BDT applies");
    assert.equal(dealZeroDeliv.total_amount, 70, "Total amount held in escrow must be 70 BDT (60 + 10)");

    // 5. Create product deal with charge = 0 in full_payment -> held = price, cod = 0
    const resZeroFull = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        product: "Free Shipping Watch",
        price: 3000,
        delivery_charge: 0,
        return_charge: 0,
        payment_mode: "full_payment",
        address: "Gulshan, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resZeroFull.status, 201);
    const dealZeroFull = await resZeroFull.json();
    assert.equal(dealZeroFull.payment_mode, "full_payment");
    assert.equal(dealZeroFull.cod_amount, 0);
    assert.equal(dealZeroFull.seller_payout, 3000);
    assert.equal(dealZeroFull.fee_amount, 30); // 3000 * 0.01 = 30
    assert.equal(dealZeroFull.total_amount, 3030); // 3000 + 30

    // Cleanup extra deals
    await q("delete from deal_events where deal_id in ($1, $2)", [dealZeroDeliv.id, dealZeroFull.id]);
    await q("delete from deals where id in ($1, $2)", [dealZeroDeliv.id, dealZeroFull.id]);
  } finally {
    server.close();
    if (dealId1) {
      await q("delete from deal_events where deal_id=$1", [dealId1]);
      await q("delete from deals where id=$1", [dealId1]);
    }
    if (dealId2) {
      await q("delete from deal_events where deal_id=$1", [dealId2]);
      await q("delete from deals where id=$1", [dealId2]);
    }
  }
});

test("POST /deals/:code/payment-mode: buyer can switch mode in created/payment_pending, amounts recomputed atomically", async () => {
  await initDb();

  const seller = await getOrCreateTestUser("01711223344", "Rahim Chowdhury", "seller");
  const buyer = await getOrCreateTestUser("01755667788", "Nusrat Jahan", "buyer");
  const outsider = await getOrCreateTestUser("01655667788", "Arifur Rahman", "buyer");

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const authHeader = (u) => ({ Authorization: `Bearer ${makeToken(u)}` });

  let dealId = null;

  try {
    // 1. Create product deal (defaults to delivery_only)
    const resCreate = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        product: "Gaming Mouse",
        price: 1800,
        delivery_charge: 100,
        return_charge: 100,
        address: "Uttara Sector 7, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resCreate.status, 201);
    const createdDeal = await resCreate.json();
    dealId = createdDeal.id;

    assert.equal(createdDeal.payment_mode, "delivery_only");
    assert.equal(createdDeal.cod_amount, 1800);
    assert.equal(createdDeal.total_amount, 210); // 200 held + 10 fee

    // 2. Outsider tries to switch payment-mode -> 403 Forbidden
    const resOutsider = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(outsider) },
      body: JSON.stringify({ payment_mode: "full_payment" }),
    });
    assert.equal(resOutsider.status, 403, "Outsider must be rejected with 403");

    // 3. Seller tries to switch payment-mode -> 403 Forbidden (buyer only)
    const resSeller = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({ payment_mode: "full_payment" }),
    });
    assert.equal(resSeller.status, 403, "Seller must be rejected with 403 (buyer only)");

    // 4. Buyer switches mode to full_payment while status is created
    const resSwitchFull = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer) },
      body: JSON.stringify({ payment_mode: "full_payment" }),
    });
    assert.equal(resSwitchFull.status, 200);
    const switchedFull = await resSwitchFull.json();
    assert.equal(switchedFull.deal.payment_mode, "full_payment");
    assert.equal(switchedFull.deal.cod_amount, 0);
    assert.equal(switchedFull.deal.held_amount, 1900); // 1800 + 100
    assert.equal(switchedFull.deal.total_amount, 1919); // 1900 + 19 fee
    assert.equal(switchedFull.deal.seller_payout, 1900);

    // Verify DB updated
    const dbFull = await one("select payment_mode, cod_amount, total_amount, fee_amount, seller_payout from deals where id=$1", [dealId]);
    assert.equal(dbFull.payment_mode, "full_payment");
    assert.equal(dbFull.cod_amount, 0);
    assert.equal(dbFull.total_amount, 1919);
    assert.equal(dbFull.fee_amount, 19);
    assert.equal(dbFull.seller_payout, 1900);

    // 5. Open deal to payment_pending
    const resOpen = await fetch(`${baseUrl}/deals/${createdDeal.code}/open`, {
      method: "POST",
      headers: authHeader(buyer),
    });
    assert.equal(resOpen.status, 200);

    // 6. Buyer switches mode back to delivery_only while in payment_pending
    const resSwitchDeliv = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer) },
      body: JSON.stringify({ payment_mode: "delivery_only" }),
    });
    assert.equal(resSwitchDeliv.status, 200);
    const switchedDeliv = await resSwitchDeliv.json();
    assert.equal(switchedDeliv.deal.payment_mode, "delivery_only");
    assert.equal(switchedDeliv.deal.cod_amount, 1800);
    assert.equal(switchedDeliv.deal.held_amount, 200);
    assert.equal(switchedDeliv.deal.total_amount, 210);

    // 7. Reject invalid payment mode value
    const resInvalidMode = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer) },
      body: JSON.stringify({ payment_mode: "crypto_pay" }),
    });
    assert.equal(resInvalidMode.status, 400);

    // 8. If deal moves to 'held', switching mode must be rejected with 400
    await q("update deals set status='held' where id=$1", [dealId]);
    const resAfterHeld = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer) },
      body: JSON.stringify({ payment_mode: "full_payment" }),
    });
    assert.equal(resAfterHeld.status, 400, "Cannot change payment mode after deal is held");

    // 9. If deal is shipped or delivered, switching mode must also be rejected with 400
    await q("update deals set status='shipped' where id=$1", [dealId]);
    const resAfterShipped = await fetch(`${baseUrl}/deals/${createdDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer) },
      body: JSON.stringify({ payment_mode: "full_payment" }),
    });
    assert.equal(resAfterShipped.status, 400, "Cannot change payment mode after deal is shipped");

    // 10. Rental / service deal cannot switch to delivery_only
    const resRental = await fetch(`${baseUrl}/deals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(seller) },
      body: JSON.stringify({
        deal_type: "rental",
        product: "Rental Bike",
        price: 2000,
        address: "Dhanmondi, Dhaka",
        buyer_phone: buyer.phone,
        buyer_name: buyer.name,
      }),
    });
    assert.equal(resRental.status, 201);
    const rentalDeal = await resRental.json();

    const resRentalSwitch = await fetch(`${baseUrl}/deals/${rentalDeal.code}/payment-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer) },
      body: JSON.stringify({ payment_mode: "delivery_only" }),
    });
    assert.equal(resRentalSwitch.status, 400, "Rental deal cannot switch to delivery_only");
    await q("delete from deal_events where deal_id=$1", [rentalDeal.id]);
    await q("delete from deals where id=$1", [rentalDeal.id]);
  } finally {
    server.close();
    if (dealId) {
      await q("delete from deal_events where deal_id=$1", [dealId]);
      await q("delete from deals where id=$1", [dealId]);
    }
  }
});
