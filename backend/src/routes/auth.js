import { Router } from "express";
import { randomInt, createHash } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { config, isDemoPhone } from "../config.js";
import { one, q, generatePublicId } from "../db.js";
import { auth, fail, isAdmin, makeToken } from "../http.js";
import { sendSms } from "../services/smsService.js";
import { verifyFirebaseIdToken } from "../services/firebaseAdmin.js";

const router = Router();
export const PHONE = /^01[3-9]\d{8}$/;

export const hashOtp = (code) => createHash("sha256").update(String(code).trim()).digest("hex");

// Rate limiters: /auth/send-otp 3/hour per phone and 10/hour per IP
export const sendOtpPhoneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => (req.body?.phone || "").trim() || "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  message: { detail: "Too many OTP requests for this phone number. Please try again after an hour." },
});

export const sendOtpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  message: { detail: "Too many OTP requests from this IP address. Please try again after an hour." },
});

// Rate limiter: /auth/verify 10 per 15 min per IP
export const verifyIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: false },
  message: { detail: "Too many verification attempts from this IP address. Please try again after 15 minutes." },
});

router.post("/send-otp", sendOtpIpLimiter, sendOtpPhoneLimiter, async (req, res) => {
  const phone = (req.body.phone || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  if (!PHONE.test(phone)) {
    return fail(400, "Enter a valid 11-digit Bangladesh mobile number (e.g. 017XXXXXXXX)");
  }

  // Demo accounts (e.g. 01711223344, 01755667788, 01700000000)
  if (isDemoPhone(phone)) {
    const demoHashed = hashOtp(config.demoOtp);
    await q("delete from otps where phone = $1", [phone]);
    await q(
      "insert into otps (phone, code, email, expires_at, attempts) values ($1, $2, $3, datetime('now', '+5 minutes'), 0)",
      [phone, demoHashed, email]
    );

    return res.json({
      sent: true,
      is_demo: true,
      message: "Demo account detected.",
    });
  }

  // Real account: generate 6-digit random OTP with crypto.randomInt
  const otp = String(randomInt(100000, 1000000));
  const hashedOtp = hashOtp(otp);

  // Store only the SHA-256 hash in otps table (valid for 5 minutes)
  await q("delete from otps where phone = $1", [phone]);
  await q(
    "insert into otps (phone, code, email, expires_at, attempts) values ($1, $2, $3, datetime('now', '+5 minutes'), 0)",
    [phone, hashedOtp, email]
  );

  const simulatedEmail = email || `${phone.replace(/\D/g, "")}@user.pakkadeal.com`;
  console.log(
    `\n======================================================================\n` +
    `[SMS & EMAIL OTP DISPATCH]\n` +
    `To Mobile: ${phone}\n` +
    `To Email: ${simulatedEmail}\n` +
    `Subject: [PakkaDeal] আপনার অ্যাকাউন্ট ভেরিফিকেশন কোড (OTP)\n` +
    `OTP Code: ${otp} (মেয়াদ ৫ মিনিট / Valid for 5 minutes)\n` +
    `======================================================================\n`
  );

  // Send real SMS if an SMS gateway is configured in .env
  const smsMessage = `[PakkaDeal] আপনার অ্যাকাউন্ট ভেরিফিকেশন ওটিপি কোড হলো: ${otp}। এটি কারো সাথে শেয়ার করবেন না। মেয়াদ ৫ মিনিট।`;
  await sendSms(phone, smsMessage);

  // Never return the OTP in any API response
  res.json({
    sent: true,
    is_demo: false,
    message: "আপনার মোবাইল নম্বরে ৬-সংখ্যার ভেরিফিকেশন ওটিপি পাঠানো হয়েছে।",
  });
});

router.post("/verify", verifyIpLimiter, async (req, res) => {
  const { phone, otp, name = "", email = "", page_name = "", role = "user" } = req.body;
  const cleanPhone = (phone || "").trim();
  const cleanOtp = (otp || "").trim();
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanName = (name || "").trim();
  const cleanRole = (role || "").trim() || "user";
  const cleanShop = (page_name || cleanName).trim();

  if (!PHONE.test(cleanPhone)) {
    return fail(400, "Enter a valid 11-digit Bangladesh mobile number");
  }
  if (!cleanOtp) {
    return fail(400, "ভেরিফিকেশন কোড লিখুন (Please enter verification code)");
  }

  const hashedInput = hashOtp(cleanOtp);
  const otpRecord = await one(
    "select * from otps where phone = $1 and expires_at > datetime('now')",
    [cleanPhone]
  );

  if (!otpRecord) {
    return fail(400, "ভুল বা মেয়াদোত্তীর্ণ ওটিপি কোড। পুনরায় কোড পাঠান। (Invalid or expired verification code)");
  }

  // Verify SHA-256 hash
  if (otpRecord.code !== hashedInput) {
    const attempts = (Number(otpRecord.attempts) || 0) + 1;
    if (attempts >= 5) {
      await q("delete from otps where phone = $1", [cleanPhone]);
      return fail(400, "সর্বোচ্চ ভেরিফিকেশন চেষ্টা অতিক্রম করেছে। ওটিপি বাতিল করা হয়েছে। (Maximum verification attempts exceeded. Code deleted.)");
    }
    await q("update otps set attempts = $2 where phone = $1", [cleanPhone, attempts]);
    return fail(400, "ভুল ওটিপি কোড। (Invalid verification code)");
  }

  // Delete OTP once verified successfully
  await q("delete from otps where phone = $1", [cleanPhone]);

  let user = await one("select * from users where phone=$1", [cleanPhone]);
  if (!user) {
    user = await one(
      `insert into users(public_id, phone, name, email, role, page_name, seller_trust, buyer_trust, token_version)
       values($1, $2, $3, $4, $5, $6, 75, 75, 1) returning *`,
      [
        generatePublicId(),
        cleanPhone,
        cleanName || "User " + cleanPhone.slice(-4),
        cleanEmail,
        cleanRole,
        cleanShop,
      ]
    );
  } else {
    if (cleanName && !user.name) {
      user = await one("update users set name=$2 where id=$1 returning *", [user.id, cleanName]);
    }
    if (cleanEmail && !user.email) {
      user = await one("update users set email=$2 where id=$1 returning *", [user.id, cleanEmail]);
    }
    if (cleanShop && !user.page_name) {
      user = await one("update users set page_name=$2 where id=$1 returning *", [user.id, cleanShop]);
    }
  }

  if (user.is_suspended) {
    return fail(403, "This account is suspended. Please contact PakkaDeal support.");
  }

  const isUserAdmin = isAdmin(user);
  res.json({
    token: makeToken(user),
    user,
    is_admin: isUserAdmin,
  });
});

router.post("/firebase-login", async (req, res) => {
  const { idToken, bkash_number = "", bkash_type = "Personal", name = "", email = "", page_name = "", role = "seller" } = req.body;
  if (!idToken) {
    return fail(400, "Firebase ID token is required");
  }

  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(idToken);
  } catch (err) {
    return fail(401, `Firebase token verification failed: ${err.message}`);
  }

  // Enforce email verification (Google sign-in is auto-verified by Firebase)
  if (!decoded.email_verified) {
    return fail(403, "Email is not verified. Please verify your email before accessing your account.");
  }

  const uid = decoded.uid;
  const decodedEmail = (decoded.email || email || "").trim().toLowerCase();
  const cleanName = (name || decoded.name || (decodedEmail ? decodedEmail.split("@")[0] : "User")).trim();
  const cleanBkash = (bkash_number || "").trim();
  const validBkashTypes = ["Personal", "Merchant", "Agent"];
  const cleanBkashType = validBkashTypes.includes(bkash_type) ? bkash_type : "Personal";
  const cleanRole = (role || "").trim() || "seller";
  const cleanShop = (page_name || cleanName).trim();

  if (cleanBkash && !PHONE.test(cleanBkash)) {
    return fail(400, "Enter a valid 11-digit Bangladeshi bKash number (e.g. 017XXXXXXXX)");
  }

  // Find user by Firebase UID or registered email
  let user = await one(
    "select * from users where (uid != '' and uid = $1) or (email != '' and email = $2)",
    [uid, decodedEmail]
  );

  if (!user) {
    // New user registration: NEVER copy bkash_number into phone!
    const userPhone = decoded.phone_number || `uid_${uid.slice(-10)}`;
    user = await one(
      `insert into users(public_id, uid, phone, name, email, bkash_number, bkash_type, bkash_verified, role, page_name, seller_trust, buyer_trust, token_version)
       values($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, 75, 75, 1) returning *`,
      [
        generatePublicId(),
        uid,
        userPhone,
        cleanName,
        decodedEmail,
        cleanBkash,
        cleanBkashType,
        cleanRole,
        cleanShop,
      ]
    );
  } else {
    // Existing user login/update
    if (!user.uid && uid) {
      await q("update users set uid=$2 where id=$1", [user.id, uid]);
      user.uid = uid;
    }
    if (!user.email && decodedEmail) {
      await q("update users set email=$2 where id=$1", [user.id, decodedEmail]);
      user.email = decodedEmail;
    }
    if (cleanName && (!user.name || user.name.startsWith("User "))) {
      await q("update users set name=$2 where id=$1", [user.id, cleanName]);
      user.name = cleanName;
    }
    if (cleanShop && !user.page_name) {
      await q("update users set page_name=$2 where id=$1", [user.id, cleanShop]);
      user.page_name = cleanShop;
    }
    // If bKash info provided and previously unset or changed: NEVER copy bkash_number into phone!
    if (cleanBkash && cleanBkash !== user.bkash_number) {
      await q(
        "update users set bkash_number=$2, bkash_type=$3, bkash_verified=0 where id=$1",
        [user.id, cleanBkash, cleanBkashType]
      );
      user.bkash_number = cleanBkash;
      user.bkash_type = cleanBkashType;
      user.bkash_verified = 0;
    }
  }

  if (user.is_suspended) {
    return fail(403, "This account is suspended. Please contact PakkaDeal support.");
  }

  const isUserAdmin = isAdmin(user);
  res.json({
    token: makeToken(user),
    user,
    is_admin: isUserAdmin,
    profile_complete: Boolean(user.bkash_number),
  });
});

router.get("/me", auth, (req, res) => {
  res.json({ user: req.user, is_admin: isAdmin(req.user) });
});

export default router;
