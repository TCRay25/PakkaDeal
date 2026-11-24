import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { initDb, one, q } from "../src/db.js";
import { makeToken } from "../src/http.js";
import "../src/index.js";

const baseUrl = `http://127.0.0.1:${config.port}`;

test("Demo Login: 1-click login without any authorization or OTP challenge", async () => {
  await initDb();

  // 1. Demo Seller (01711223344) logs in with 1 click
  const sellerRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "01711223344" }),
  });
  assert.equal(sellerRes.status, 200);
  const sellerData = await sellerRes.json();
  assert.ok(sellerData.token);
  assert.equal(sellerData.user.phone, "01711223344");
  assert.equal(sellerData.is_admin, false);
  assert.equal(sellerData.profile_complete, true);

  // 2. Demo Buyer (01755667788) logs in with 1 click
  const buyerRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "01755667788" }),
  });
  assert.equal(buyerRes.status, 200);
  const buyerData = await buyerRes.json();
  assert.ok(buyerData.token);
  assert.equal(buyerData.user.phone, "01755667788");
  assert.equal(buyerData.is_admin, false);
  assert.equal(buyerData.profile_complete, true);

  // 3. Admin (01700000000) logs in with 1 click
  const adminRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "01700000000" }),
  });
  assert.equal(adminRes.status, 200);
  const adminData = await adminRes.json();
  assert.ok(adminData.token);
  assert.equal(adminData.user.phone, "01700000000");
  assert.equal(adminData.is_admin, true);
  assert.equal(adminData.profile_complete, true);

  // 4. Non-demo phone cannot use /auth/demo-login
  const nonDemoRes = await fetch(`${baseUrl}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "01899112233" }),
  });
  assert.equal(nonDemoRes.status, 403);

  // 5. POST /auth/verify with demo phone also works without any OTP challenge
  const verifyDemoRes = await fetch(`${baseUrl}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: "01711223344", otp: "anything" }),
  });
  assert.equal(verifyDemoRes.status, 200);
  const verifyData = await verifyDemoRes.json();
  assert.ok(verifyData.token);
  assert.equal(verifyData.user.phone, "01711223344");
});

test("Demo Data Isolation: created accounts cannot see demo data", async () => {
  await initDb();

  // Create a brand new regular user (e.g. registered via email or new phone)
  const realUserPhone = "01877665544";
  await q("delete from users where phone = $1", [realUserPhone]);
  const realUser = await one(
    `insert into users(public_id, phone, name, email, role, bkash_number, bkash_type, bkash_verified, token_version)
     values('usr_real_test', $1, 'Real User Test', 'realuser@test.com', 'user', $1, 'Personal', 1, 1)
     returning *`,
    [realUserPhone]
  );
  const realUserToken = makeToken(realUser);

  // Also fetch demo seller
  const demoSeller = await one("select * from users where phone = '01711223344'");
  const demoSellerToken = makeToken(demoSeller);

  // 1. Real created user cannot access demo deals via GET /deals/:code
  const demoDealRes = await fetch(`${baseUrl}/deals/PK-MOCK-A-TRUSTED`, {
    headers: { Authorization: `Bearer ${realUserToken}` },
  });
  assert.equal(demoDealRes.status, 404);

  // 2. Unauthenticated user cannot view demo deal
  const unauthDemoRes = await fetch(`${baseUrl}/deals/PK-MOCK-A-TRUSTED`);
  assert.equal(unauthDemoRes.status, 404);

  // 3. Demo seller CAN view demo deal
  const demoSellerDealRes = await fetch(`${baseUrl}/deals/PK-MOCK-A-TRUSTED`, {
    headers: { Authorization: `Bearer ${demoSellerToken}` },
  });
  assert.equal(demoSellerDealRes.status, 200);
  const demoDealData = await demoSellerDealRes.json();
  assert.equal(demoDealData.deal.code, "PK-MOCK-A-TRUSTED");

  // 4. GET /deals for real user returns 0 demo deals
  const realUserDealsRes = await fetch(`${baseUrl}/deals`, {
    headers: { Authorization: `Bearer ${realUserToken}` },
  });
  assert.equal(realUserDealsRes.status, 200);
  const realDeals = await realUserDealsRes.json();
  const foundDemo = realDeals.some(
    (d) => d.code.startsWith("PK-MOCK-") || d.code.startsWith("PK-PROD-") || d.is_demo === 1
  );
  assert.equal(foundDemo, false);

  // 5. When real user creates their own deal, they CAN see it
  const createRes = await fetch(`${baseUrl}/deals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${realUserToken}`,
    },
    body: JSON.stringify({
      product: "Real Laptop Stand",
      price: 1500,
      delivery_charge: 100,
      payment_mode: "delivery_only",
      buyer_phone: "01811998877",
      buyer_name: "Another Real Buyer",
      address: "Chittagong",
    }),
  });

  assert.equal(createRes.status, 201);
  const createdDeal = await createRes.json();
  const newCode = createdDeal.code;

  const realUserDealsAfter = await fetch(`${baseUrl}/deals`, {
    headers: { Authorization: `Bearer ${realUserToken}` },
  });
  assert.equal(realUserDealsAfter.status, 200);
  const dealsAfter = await realUserDealsAfter.json();
  assert.ok(dealsAfter.some((d) => d.code === newCode));

  // Clean up
  await q("delete from deals where code = $1", [newCode]);
  await q("delete from users where phone = $1", [realUserPhone]);
  setTimeout(() => process.exit(0), 100);
});
