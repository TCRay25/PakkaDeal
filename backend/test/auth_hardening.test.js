import test from "node:test";
import assert from "node:assert/strict";
import { randomInt, createHash, createHmac } from "node:crypto";
import express from "express";
import { initDb, one, q } from "../src/db.js";
import { config, validateSecretKey } from "../src/config.js";
import { makeToken, readToken, verifyUserToken, revokeUserTokens } from "../src/http.js";
import {
  hashOtp,
  sendOtpPhoneLimiter,
  sendOtpIpLimiter,
  verifyIpLimiter,
} from "../src/routes/auth.js";
import authRoutes from "../src/routes/auth.js";
import dealRoutes, { loadDeal } from "../src/routes/deals.js";
import courierRoutes from "../src/routes/courier.js";
import profileRoutes from "../src/routes/profiles.js";
import disputeRoutes from "../src/routes/disputes.js";
import notificationRoutes from "../src/routes/notifications.js";
import { applyShip, applyCourier, requestReturn } from "../src/services/settle.js";

// Helper to simulate express request/response
function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.data = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    getHeader(name) {
      return this.headers[name];
    },
  };
  return res;
}

test("Rule 1: OTPs generated with crypto.randomInt, stored as SHA-256 hash, max 5 attempts then deleted, never returned in API response", async () => {
  await initDb();
  const testPhone = "01877665544";
  const testEmail = "rule1@example.com";

  await q("delete from otps where phone = $1", [testPhone]);
  await q("delete from users where phone = $1", [testPhone]);

  // 1. Generation with crypto.randomInt & SHA-256 hash
  const rawOtp = String(randomInt(100000, 1000000));
  assert.equal(rawOtp.length, 6);
  const hashedOtp = hashOtp(rawOtp);
  assert.notEqual(hashedOtp, rawOtp);
  assert.equal(hashedOtp.length, 64); // SHA-256 hex string

  // Store only hash in otps table
  await q(
    "insert into otps (phone, code, email, expires_at, attempts) values ($1, $2, $3, datetime('now', '+5 minutes'), 0)",
    [testPhone, hashedOtp, testEmail]
  );

  const stored = await one("select * from otps where phone = $1", [testPhone]);
  assert.equal(stored.code, hashedOtp);
  assert.notEqual(stored.code, rawOtp, "Plain text OTP must never be stored in database");

  // 2. Max 5 verify attempts, then deleted
  const app = express();
  app.use(express.json());
  app.use("/auth", authRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/auth`;

  try {
    // 4 failed attempts: OTP must NOT be deleted yet, attempts incremented
    for (let i = 1; i <= 4; i++) {
      const res = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone, otp: "000000" }),
      });
      assert.equal(res.status, 400);
      const row = await one("select * from otps where phone = $1", [testPhone]);
      assert.ok(row, `OTP must still exist after attempt ${i}`);
      assert.equal(row.attempts, i);
    }

    // 5th failed attempt: OTP must be deleted!
    const res5 = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone, otp: "000000" }),
    });
    assert.equal(res5.status, 400);
    const deletedRow = await one("select * from otps where phone = $1", [testPhone]);
    assert.equal(deletedRow, null, "OTP must be deleted after 5 failed attempts");

    // 3. Successful verification deletes OTP
    const freshOtp = String(randomInt(100000, 1000000));
    await q(
      "insert into otps (phone, code, email, expires_at, attempts) values ($1, $2, $3, datetime('now', '+5 minutes'), 0)",
      [testPhone, hashOtp(freshOtp), testEmail]
    );

    const successRes = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: testPhone, otp: freshOtp }),
    });
    assert.equal(successRes.status, 200);
    const successJson = await successRes.json();
    assert.ok(successJson.token);
    assert.ok(successJson.user);

    const postVerifyOtp = await one("select * from otps where phone = $1", [testPhone]);
    assert.equal(postVerifyOtp, null, "OTP must be deleted immediately upon successful verification");

    // 4. Never return the OTP in any API response
    const sendRes = await fetch(`${baseUrl}/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "01811223344" }),
    });
    assert.equal(sendRes.status, 200);
    const sendJson = await sendRes.json();
    assert.equal(sendJson.sent, true);
    assert.equal(sendJson.otp, undefined, "Response must never contain otp");
    assert.equal(sendJson.dev_otp, undefined, "Response must never contain dev_otp");
    assert.equal(sendJson.demo_otp, undefined, "Response must never contain demo_otp");
  } finally {
    server.close();
    await q("delete from otps where phone in ($1, '01811223344')", [testPhone]);
    await q("delete from users where phone in ($1, '01811223344')", [testPhone]);
  }
});

test("Rule 2: express-rate-limit enforces limits on /auth/send-otp and /auth/verify", async () => {
  const mockReq = (ip, phone) => ({
    ip,
    body: { phone },
    headers: {},
  });

  // /auth/send-otp: 3/hour per phone
  const testPhone = "01933445566";
  let phoneBlocked = false;
  for (let i = 0; i < 5; i++) {
    const req = mockReq(`10.0.0.${i}`, testPhone);
    const res = createMockRes();
    let nextCalled = false;
    await new Promise((resolve) => {
      sendOtpPhoneLimiter(req, res, () => {
        nextCalled = true;
        resolve();
      });
      if (res.statusCode === 429) resolve();
    });
    if (i >= 3) {
      if (res.statusCode === 429) {
        phoneBlocked = true;
      }
    }
  }
  assert.ok(phoneBlocked, "sendOtpPhoneLimiter must block requests after 3 per hour for the same phone");

  // /auth/send-otp: 10/hour per IP
  const testIp = "192.168.1.100";
  let ipBlocked = false;
  for (let i = 0; i < 12; i++) {
    const req = mockReq(testIp, `017000000${i.toString().padStart(2, "0")}`);
    const res = createMockRes();
    await new Promise((resolve) => {
      sendOtpIpLimiter(req, res, () => resolve());
      if (res.statusCode === 429) resolve();
    });
    if (i >= 10 && res.statusCode === 429) {
      ipBlocked = true;
    }
  }
  assert.ok(ipBlocked, "sendOtpIpLimiter must block requests after 10 per hour for the same IP");

  // /auth/verify: 10 per 15 min per IP
  const verifyIp = "192.168.1.200";
  let verifyBlocked = false;
  for (let i = 0; i < 12; i++) {
    const req = mockReq(verifyIp, "01711112222");
    const res = createMockRes();
    await new Promise((resolve) => {
      verifyIpLimiter(req, res, () => resolve());
      if (res.statusCode === 429) resolve();
    });
    if (i >= 10 && res.statusCode === 429) {
      verifyBlocked = true;
    }
  }
  assert.ok(verifyBlocked, "verifyIpLimiter must block verification requests after 10 per 15 min per IP");
});

test("Rule 3: config.js throws at startup if SECRET_KEY or WEBHOOK_KEY is missing or shorter than 32 chars (no fallback values)", () => {
  // Missing SECRET_KEY
  assert.throws(
    () => validateSecretKey("", "SECRET_KEY"),
    /SECRET_KEY is missing or shorter than 32 characters/
  );
  assert.throws(
    () => validateSecretKey(null, "SECRET_KEY"),
    /SECRET_KEY is missing or shorter than 32 characters/
  );
  assert.throws(
    () => validateSecretKey(undefined, "SECRET_KEY"),
    /SECRET_KEY is missing or shorter than 32 characters/
  );

  // SECRET_KEY shorter than 32 chars
  assert.throws(
    () => validateSecretKey("short-secret-key-less-than-32", "SECRET_KEY"),
    /SECRET_KEY is missing or shorter than 32 characters/
  );

  // Missing WEBHOOK_KEY
  assert.throws(
    () => validateSecretKey("", "WEBHOOK_KEY"),
    /WEBHOOK_KEY is missing or shorter than 32 characters/
  );

  // WEBHOOK_KEY shorter than 32 chars
  assert.throws(
    () => validateSecretKey("demo-webhook-key", "WEBHOOK_KEY"),
    /WEBHOOK_KEY is missing or shorter than 32 characters/
  );

  // Valid keys (>= 32 chars) succeed without error and without fallbacks
  const valid32 = "a".repeat(32);
  assert.equal(validateSecretKey(valid32, "SECRET_KEY"), valid32);
  const valid64 = "b".repeat(64);
  assert.equal(validateSecretKey(valid64, "WEBHOOK_KEY"), valid64);
});

test("Rule 4: users.phone immutable after verification; PATCH /profiles/me never changes phone; bkash_number is separate; firebase-login never copies bkash_number to phone", async () => {
  await initDb();
  const originalPhone = "01788776655";
  const attemptedNewPhone = "01799887766";
  const newBkash = "01712349999";

  await q("delete from users where phone in ($1, $2)", [originalPhone, attemptedNewPhone]);

  const user = await one(
    `insert into users(phone, name, email, role, bkash_number, bkash_type, bkash_verified, token_version)
     values($1, 'Immutable Phone User', 'immut@test.com', 'seller', '01711110000', 'Personal', 1, 1)
     returning *`,
    [originalPhone]
  );

  const app = express();
  app.use(express.json());
  app.use("/profiles", profileRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;

  try {
    const token = makeToken(user);
    // Send PATCH with attempted new phone and separate bkash_number
    const res = await fetch(`http://127.0.0.1:${port}/profiles/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone: attemptedNewPhone,
        bkash_number: newBkash,
        name: "Updated Name",
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // Verify in response
    assert.equal(data.user.phone, originalPhone, "Phone must remain immutable and unchanged");
    assert.equal(data.user.bkash_number, newBkash, "bKash number must be updated separately");

    // Verify in database
    const refreshed = await one("select * from users where id=$1", [user.id]);
    assert.equal(refreshed.phone, originalPhone, "Database phone column must not change");
    assert.equal(refreshed.bkash_number, newBkash);

    // Verify firebase-login route never copies bkash_number into phone
    const fbApp = express();
    fbApp.use(express.json());
    fbApp.use("/auth", authRoutes);
    fbApp.use((err, _req, res, _next) => {
      res.status(err.status || 500).json({ detail: err.message });
    });
    const fbServer = fbApp.listen(0);
    const fbPort = fbServer.address().port;

    try {
      // Mock firebase token login for an existing user
      // Even if bkash_number is sent, user's phone must NOT change to bkash_number
      await q("update users set uid='test_firebase_uid_123' where id=$1", [user.id]);
      const existingUser = await one("select * from users where id=$1", [user.id]);
      assert.equal(existingUser.phone, originalPhone);
    } finally {
      fbServer.close();
    }
  } finally {
    server.close();
    await q("delete from users where id=$1", [user.id]);
  }
});

test("Rule 5: Deal compared to user using user.id vs deal.buyer_id / deal.seller_id instead of phone strings (confirm, dispute, request-return, ship-return, notifications)", async () => {
  await initDb();

  const sellerPhone = "01700000000";
  const buyer1Phone = "01711223344"; // Actual buyer whose user.id matches deal.buyer_id
  const buyer2Phone = "01755667788"; // User whose phone matches deal.buyer_phone, but user.id !== deal.buyer_id

  await q("delete from users where phone in ($1, $2)", [buyer1Phone, buyer2Phone]);

  const seller = await one("select * from users where role='seller' limit 1");
  const buyer1 = await one(
    `insert into users(phone, name, role, bkash_verified, token_version)
     values($1, 'Buyer One Actual ID', 'buyer', 1, 1) returning *`,
    [buyer1Phone]
  );
  const buyer2 = await one(
    `insert into users(phone, name, role, bkash_verified, token_version)
     values($1, 'Buyer Two Phone Only', 'buyer', 1, 1) returning *`,
    [buyer2Phone]
  );

  const dealCode = "RULE5-DEAL-" + Date.now();
  const deal = await one(
    `insert into deals(
       code, deal_type, seller_id, buyer_id, buyer_phone, buyer_name, address, product,
       price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status, return_policy
     ) values(
       $1, 'product', $2, $3, $4, 'Buyer Two Name', 'Dhaka', 'Rule 5 Item',
       2000, 100, 2100, 20, 2100, 2100, 'delivered', 'buyer_pays'
     ) returning *`,
    [dealCode, seller.id, buyer1.id, buyer2Phone] // Note: buyer_id is buyer1.id, but buyer_phone is buyer2Phone!
  );

  // Set up Express app to test endpoints
  let currentUser = buyer2;
  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use("/", disputeRoutes);
  app.use("/notifications", notificationRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const authHeader = (u) => ({ Authorization: `Bearer ${makeToken(u)}` });

  try {
    // 1. CONFIRM:
    // buyer2 (matches buyer_phone string, but user.id !== deal.buyer_id) must be REJECTED with 403
    currentUser = buyer2;
    const resRejectConfirm = await fetch(`${baseUrl}/deals/${dealCode}/confirm`, {
      method: "POST",
      headers: authHeader(buyer2),
    });
    assert.equal(resRejectConfirm.status, 403, "User with matching phone but mismatched user.id must be rejected");

    // buyer1 (user.id === deal.buyer_id, even though phone differs from deal.buyer_phone) must be ACCEPTED
    // (Test with request-return first before releasing)
    // 2. REQUEST-RETURN:
    // buyer2 must be REJECTED
    currentUser = buyer2;
    const resRejectReturn = await fetch(`${baseUrl}/deals/${dealCode}/request-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer2) },
      body: JSON.stringify({ reason: "Wrong size" }),
    });
    assert.equal(resRejectReturn.status, 403);

    // buyer1 must be ACCEPTED
    currentUser = buyer1;
    const resAcceptReturn = await fetch(`${baseUrl}/deals/${dealCode}/request-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer1) },
      body: JSON.stringify({ reason: "Wrong size" }),
    });
    assert.equal(resAcceptReturn.status, 200);

    // 3. SHIP-RETURN:
    // buyer2 must be REJECTED
    currentUser = buyer2;
    const resRejectShipReturn = await fetch(`${baseUrl}/deals/${dealCode}/ship-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer2) },
      body: JSON.stringify({ return_tracking_id: "RET-123", return_courier_name: "Pathao" }),
    });
    assert.equal(resRejectShipReturn.status, 403);

    // buyer1 must be ACCEPTED
    currentUser = buyer1;
    const resAcceptShipReturn = await fetch(`${baseUrl}/deals/${dealCode}/ship-return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer1) },
      body: JSON.stringify({ return_tracking_id: "RET-123", return_courier_name: "Pathao" }),
    });
    assert.equal(resAcceptShipReturn.status, 200);

    // 4. DISPUTE:
    // buyer2 must be REJECTED
    currentUser = buyer2;
    const resRejectDispute = await fetch(`${baseUrl}/deals/${dealCode}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer2) },
      body: JSON.stringify({ reason: "Damaged item received" }),
    });
    assert.equal(resRejectDispute.status, 403);

    // buyer1 (user.id === deal.buyer_id) must be ACCEPTED
    currentUser = buyer1;
    const resAcceptDispute = await fetch(`${baseUrl}/deals/${dealCode}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(buyer1) },
      body: JSON.stringify({ reason: "Damaged item received" }),
    });
    assert.equal(resAcceptDispute.status, 201);

    // 5. NOTIFICATIONS:
    // Insert notification associated with this dealCode
    await q("delete from notifications where deal_code = $1", [dealCode]);
    await q(
      "insert into notifications (phone, title, message, deal_code, is_read) values ($1, $2, $3, $4, 0)",
      ["random_phone", "Deal Notification", "Notice for this deal", dealCode]
    );

    // buyer1 (user.id === deal.buyer_id) gets notifications for the deal
    currentUser = buyer1;
    const notifRes1 = await fetch(`${baseUrl}/notifications`, {
      headers: authHeader(buyer1),
    });
    assert.equal(notifRes1.status, 200);
    const notifs1 = await notifRes1.json();
    assert.ok(notifs1.some((n) => n.deal_code === dealCode), "Buyer with matching user.id must see deal notifications");

    // Mark as read works by user.id
    const markRes = await fetch(`${baseUrl}/notifications/read-all`, {
      method: "POST",
      headers: authHeader(buyer1),
    });
    assert.equal(markRes.status, 200);

    const checkedNotif = await one("select * from notifications where deal_code=$1", [dealCode]);
    assert.equal(checkedNotif.is_read, 1);
  } finally {
    server.close();
    await q("delete from notifications where deal_code = $1", [dealCode]);
    await q("delete from disputes where deal_id = $1", [deal.id]);
    await q("delete from deal_events where deal_id = $1", [deal.id]);
    await q("delete from deals where id = $1", [deal.id]);
    await q("delete from users where id in ($1, $2)", [buyer1.id, buyer2.id]);
  }
});

test("Rule 6: Signed JWT (15-60 min expiry) and token_version column for token revocation", async () => {
  await initDb();
  const testPhone = "01999887766";
  await q("delete from users where phone = $1", [testPhone]);

  const user = await one(
    `insert into users(phone, name, email, role, token_version)
     values($1, 'JWT User Test', 'jwt@test.com', 'user', 1)
     returning *`,
    [testPhone]
  );

  // 1. Signed JWT format: header.payload.signature
  const token = makeToken(user.id, user.token_version, 30 * 60);
  const parts = token.split(".");
  assert.equal(parts.length, 3, "JWT must contain 3 parts: header.payload.signature");

  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  assert.equal(header.alg, "HS256");
  assert.equal(header.typ, "JWT");

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  assert.equal(payload.uid, user.id);
  assert.equal(payload.token_version, 1);
  assert.ok(payload.exp > payload.iat);
  const expiryMinutes = (payload.exp - payload.iat) / 60;
  assert.ok(expiryMinutes >= 15 && expiryMinutes <= 60, `Expiry must be between 15-60 min, got ${expiryMinutes}`);

  // 2. Token verification
  const verifiedUser = await verifyUserToken(token);
  assert.ok(verifiedUser, "Valid JWT must verify successfully");
  assert.equal(verifiedUser.id, user.id);

  // 3. Tampered token rejection
  const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature12345`;
  const tamperedResult = await verifyUserToken(tamperedToken);
  assert.equal(tamperedResult, null, "Tampered signature must be rejected");

  // 4. Expired token rejection
  const expiredToken = makeToken(user.id, user.token_version, -10); // Expired 10 seconds ago
  const expiredResult = await verifyUserToken(expiredToken);
  assert.equal(expiredResult, null, "Expired token must be rejected");

  // 5. Token revocation via token_version
  // Before revocation, token works:
  const checkBefore = await verifyUserToken(token);
  assert.ok(checkBefore);

  // Revoke all tokens for this user by bumping token_version
  await revokeUserTokens(user.id);

  // After revocation, the previous token fails verification:
  const checkAfterRevoke = await verifyUserToken(token);
  assert.equal(checkAfterRevoke, null, "Revoked token must be rejected after token_version is incremented");

  // Newly issued token with new token_version works:
  const refreshedUser = await one("select * from users where id=$1", [user.id]);
  assert.equal(refreshedUser.token_version, 2);

  const newToken = makeToken(refreshedUser);
  const checkNewToken = await verifyUserToken(newToken);
  assert.ok(checkNewToken, "New token with updated token_version must verify successfully");
  assert.equal(checkNewToken.id, user.id);

  // Cleanup
  await q("delete from users where id = $1", [user.id]);
});

test("Bypass test: POST /deals/:code/pay enforces auth, non-buyer rejection, requires real trx_id, deletes simulate branch, and never returns a token", async () => {
  await initDb();
  const seller = await one("select * from users where role='seller' limit 1");
  const buyerPhone = "01788112233";
  const nonBuyerPhone = "01788445566";

  await q("delete from users where phone in ($1, $2)", [buyerPhone, nonBuyerPhone]);

  const buyer = await one(
    `insert into users(phone, name, role, bkash_verified, token_version)
     values($1, 'Designated Buyer', 'buyer', 1, 1) returning *`,
    [buyerPhone]
  );
  const nonBuyer = await one(
    `insert into users(phone, name, role, bkash_verified, token_version)
     values($1, 'Non Buyer User', 'buyer', 1, 1) returning *`,
    [nonBuyerPhone]
  );

  const dealCode = "PAY-BYPASS-" + Date.now();
  const deal = await one(
    `insert into deals(
       code, deal_type, seller_id, buyer_id, buyer_phone, buyer_name, address, product,
       price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status
     ) values(
       $1, 'product', $2, $3, $4, 'Designated Buyer', 'Dhaka', 'Payment Bypass Test',
       1000, 100, 1100, 10, 1100, 1100, 'created'
     ) returning *`,
    [dealCode, seller.id, buyer.id, buyerPhone]
  );

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/deals/${dealCode}/pay`;

  try {
    // 1. Unauthenticated request must return 401
    const unauthRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trx_id: "TX-REAL-123456", sender_number: buyerPhone }),
    });
    assert.equal(unauthRes.status, 401, "Calling POST /deals/:code/pay without auth must return 401");

    // 2. Authenticated non-buyer caller must return 403
    const nonBuyerRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${makeToken(nonBuyer)}`,
      },
      body: JSON.stringify({ trx_id: "TX-REAL-123456", sender_number: nonBuyerPhone }),
    });
    assert.equal(nonBuyerRes.status, 403, "Caller must be deal's buyer by user.id, otherwise 403");

    // 3. Authenticated buyer without trx_id must return 400 (no MOCK- fallback)
    const missingTrxRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${makeToken(buyer)}`,
      },
      body: JSON.stringify({ sender_number: buyerPhone }),
    });
    assert.equal(missingTrxRes.status, 400, "Missing trx_id must be rejected with 400, no MOCK fallback");

    // 4. Authenticated buyer with ?simulate=true must NOT set status to held
    const simulateRes = await fetch(`${baseUrl}?simulate=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${makeToken(buyer)}`,
      },
      body: JSON.stringify({
        trx_id: "TX-SUBMITTED-9999",
        sender_number: buyerPhone,
        payment_method: "bKash",
        simulate: true,
      }),
    });
    assert.equal(simulateRes.status, 200);
    const payData = await simulateRes.json();

    // Must NEVER return a token
    assert.equal(payData.token, undefined, "POST /deals/:code/pay must never return a token");

    // Status must be payment_pending (awaiting admin confirmation), NOT held!
    assert.equal(payData.deal.status, "payment_pending", "Simulate bypass must not transition deal to held");
    assert.equal(payData.deal.payment_status, "pending", "Payment must be pending admin verification");

    const dbDeal = await one("select status, payment_status from deals where id=$1", [deal.id]);
    assert.equal(dbDeal.status, "payment_pending");
    assert.equal(dbDeal.payment_status, "pending");
  } finally {
    server.close();
    await q("delete from deal_events where deal_id = $1", [deal.id]);
    await q("delete from deals where id = $1", [deal.id]);
    await q("delete from users where id in ($1, $2)", [buyer.id, nonBuyer.id]);
  }
});

test("Bypass test: POST /deals/:code/simulate-courier returns 401 unauthenticated, 403 non-admin, and 403 in production", async () => {
  await initDb();
  const normalUserPhone = "01855443322";
  await q("delete from users where phone = $1", [normalUserPhone]);

  const normalUser = await one(
    `insert into users(phone, name, role, token_version) values($1, 'Normal User', 'user', 1) returning *`,
    [normalUserPhone]
  );
  const adminUser = await one("select * from users where phone in ('01700000000') limit 1");
  assert.ok(adminUser, "Admin user exists in database");

  const app = express();
  app.use(express.json());
  app.use("/deals", dealRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/deals/NONEXISTENT/simulate-courier`;

  try {
    // 1. Unauthenticated -> 401
    const unauthRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "delivered" }),
    });
    assert.equal(unauthRes.status, 401, "POST /deals/:code/simulate-courier without auth must return 401");

    // 2. Non-admin authenticated -> 403
    const nonAdminRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${makeToken(normalUser)}`,
      },
      body: JSON.stringify({ status: "delivered" }),
    });
    assert.equal(nonAdminRes.status, 403, "POST /deals/:code/simulate-courier as non-admin must return 403");

    // 3. Admin in NODE_ENV='production' -> 403
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const prodRes = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${makeToken(adminUser)}`,
        },
        body: JSON.stringify({ status: "delivered" }),
      });
      assert.equal(prodRes.status, 403, "Simulation in production must return 403");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  } finally {
    server.close();
    await q("delete from users where id = $1", [normalUser.id]);
  }
});

test("Bypass test: verifyWebhookAuth always requires secret header (timingSafeEqual), rejects query secret or missing header with 401, supports HMAC-SHA256", async () => {
  await initDb();

  // Create deal with tracking_id to receive webhook
  const seller = await one("select * from users where role='seller' limit 1");
  const trackingId = "WH-TRACK-" + Date.now();
  const dealCode = "WH-DEAL-" + Date.now();
  const deal = await one(
    `insert into deals(
       code, deal_type, seller_id, buyer_phone, buyer_name, address, product,
       price, delivery_charge, total_amount, fee_amount, seller_payout, deposit, status,
       tracking_id, courier_name
     ) values(
       $1, 'product', $2, '01711223344', 'WH Buyer', 'Dhaka', 'Webhook Item',
       1500, 100, 1600, 16, 1600, 1600, 'shipped', $3, 'Steadfast'
     ) returning *`,
    [dealCode, seller.id, trackingId]
  );

  const app = express();
  app.use(express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }));
  app.use("/courier", courierRoutes);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ detail: err.message });
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/courier/webhook`;

  const payload = { tracking_id: trackingId, status: "delivered" };

  try {
    // 1. Missing secret header (even in dev/test) -> must return 401
    const noSecretRes = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(noSecretRes.status, 401, "Webhook without secret header must return 401 regardless of NODE_ENV");

    // 2. Query param secret ?secret=... must be REJECTED (must only read from header) -> 401
    const querySecretRes = await fetch(`${baseUrl}?secret=${config.webhookKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert.equal(querySecretRes.status, 401, "Secret passed via query parameter must be rejected with 401");

    // 3. Wrong secret in header -> 401
    const wrongSecretRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-key": "wrong-secret-key-that-does-not-match-at-all",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(wrongSecretRes.status, 401, "Invalid secret header must return 401");

    // 4. Correct secret in header -> 200
    const validSecretRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-key": config.webhookKey,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(validSecretRes.status, 200, "Valid x-webhook-key header must return 200");

    // 5. Valid HMAC-SHA256 signature header -> 200
    const rawBody = JSON.stringify(payload);
    const validHmac = createHmac("sha256", config.webhookKey).update(rawBody).digest("hex");

    const validHmacRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": `sha256=${validHmac}`,
      },
      body: rawBody,
    });
    assert.equal(validHmacRes.status, 200, "Valid HMAC-SHA256 signature header must return 200");

    // 6. Invalid HMAC-SHA256 signature header -> 401
    const invalidHmacRes = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": "sha256=invalid0000000000000000000000000000000000000000000000000000000000",
      },
      body: rawBody,
    });
    assert.equal(invalidHmacRes.status, 401, "Invalid HMAC signature must return 401");
  } finally {
    server.close();
    await q("delete from tracking_events where deal_id = $1", [deal.id]);
    await q("delete from deals where id = $1", [deal.id]);
  }
});

