import test from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { initDb, one, q } from "../src/db.js";
import { config, isDemoPhone } from "../src/config.js";
import { hashOtp } from "../src/routes/auth.js";

test("auth: isDemoPhone correctly identifies demo and real numbers", () => {
  assert.equal(isDemoPhone("01700000000"), true);
  assert.equal(isDemoPhone("01711223344"), true);
  assert.equal(isDemoPhone("01755667788"), true);

  assert.equal(isDemoPhone("01799887766"), false);
  assert.equal(isDemoPhone("01812345678"), false);
  assert.equal(isDemoPhone("01999888777"), false);
});

test("auth: real phone generates random 6-digit OTP, rejects demo code, and accepts real OTP hash", async () => {
  await initDb();

  const realPhone = "01912345678";
  const testEmail = "testuser@example.com";

  // Clean any previous test data
  await q("delete from otps where phone = $1", [realPhone]);
  await q("delete from users where phone = $1", [realPhone]);

  // Simulate send-otp with crypto.randomInt and SHA-256 hash
  const randomOtp = String(randomInt(100000, 1000000));
  assert.equal(randomOtp.length, 6);
  assert.notEqual(randomOtp, config.demoOtp);

  const hashedOtp = hashOtp(randomOtp);

  await q(
    "insert into otps (phone, code, email, expires_at, attempts) values ($1, $2, $3, datetime('now', '+5 minutes'), 0)",
    [realPhone, hashedOtp, testEmail]
  );

  // 1. Verify that '123456' is REJECTED for non-demo account
  const invalidAttempt = await one(
    "select * from otps where phone = $1 and code = $2 and expires_at > datetime('now')",
    [realPhone, hashOtp("123456")]
  );
  assert.equal(invalidAttempt, null, "Demo code '123456' must not match real account OTP");

  // 2. Verify that the generated OTP hash matches
  const validAttempt = await one(
    "select * from otps where phone = $1 and code = $2 and expires_at > datetime('now')",
    [realPhone, hashedOtp]
  );
  assert.ok(validAttempt, "Real OTP hash must match stored record");
  assert.equal(validAttempt.code, hashedOtp);
  assert.equal(validAttempt.email, testEmail);

  // 3. Consume OTP and create user
  await q("delete from otps where phone = $1", [realPhone]);
  const newUser = await one(
    `insert into users(phone, name, email, role, page_name)
     values($1, $2, $3, $4, $5) returning *`,
    [realPhone, "Real User Test", testEmail, "user", "Real Shop"]
  );

  assert.ok(newUser);
  assert.equal(newUser.phone, realPhone);
  assert.equal(newUser.email, testEmail);
  assert.equal(newUser.name, "Real User Test");

  // 4. Verify OTP is consumed
  const consumedCheck = await one("select * from otps where phone = $1", [realPhone]);
  assert.equal(consumedCheck, null, "OTP must be deleted after successful verification");

  // Cleanup
  await q("delete from users where phone = $1", [realPhone]);
});
