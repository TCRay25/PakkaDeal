import { Router } from "express";
import { config, isDemoPhone } from "../config.js";
import { one, q } from "../db.js";
import { auth, fail, isAdmin, makeToken } from "../http.js";
import { sendSms } from "../services/smsService.js";
import { verifyFirebaseIdToken } from "../services/firebaseAdmin.js";

const router = Router();
export const PHONE = /^01[3-9]\d{8}$/;

router.post("/send-otp", async (req, res) => {
  const phone = (req.body.phone || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  if (!PHONE.test(phone)) {
    return fail(400, "Enter a valid 11-digit Bangladesh mobile number (e.g. 017XXXXXXXX)");
  }

  // Demo accounts (e.g. 01711223344, 01755667788, 01700000000)
  if (isDemoPhone(phone)) {
    return res.json({
      sent: true,
      is_demo: true,
      demo_otp: config.demoOtp,
      message: `Demo account detected. Use demo code: ${config.demoOtp}`,
    });
  }

  // Real account: generate 6-digit random OTP
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  // Store in otps table (valid for 5 minutes)
  await q("delete from otps where phone = $1", [phone]);
  await q(
    "insert into otps (phone, code, email, expires_at) values ($1, $2, $3, datetime('now', '+5 minutes'))",
    [phone, otp, email]
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

  res.json({
    sent: true,
    is_demo: false,
    message: "আপনার মোবাইল নম্বরে ৬-সংখ্যার ভেরিফিকেশন ওটিপি পাঠানো হয়েছে।",
    dev_otp: process.env.NODE_ENV === "production" ? undefined : otp,
  });
});

router.post("/verify", async (req, res) => {
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

  if (isDemoPhone(cleanPhone)) {
    if (cleanOtp !== config.demoOtp) {
      return fail(400, "Invalid verification code. Enter " + config.demoOtp);
    }
  } else {
    const validOtp = await one(
      "select * from otps where phone = $1 and code = $2 and expires_at > datetime('now')",
      [cleanPhone, cleanOtp]
    );
    if (!validOtp) {
      return fail(400, "ভুল বা মেয়াদোত্তীর্ণ ওটিপি কোড। পুনরায় কোড পাঠান। (Invalid or expired verification code)");
    }
    // Delete OTP once verified
    await q("delete from otps where phone = $1", [cleanPhone]);
  }

  let user = await one("select * from users where phone=$1", [cleanPhone]);
  if (!user) {
    user = await one(
      `insert into users(phone, name, email, role, page_name, seller_trust, buyer_trust)
       values($1, $2, $3, $4, $5, 75, 75) returning *`,
      [
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
    token: makeToken(user.id),
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
    // New user registration
    const userPhone = cleanBkash || `uid_${uid.slice(-10)}`;
    user = await one(
      `insert into users(uid, phone, name, email, bkash_number, bkash_type, bkash_verified, role, page_name, seller_trust, buyer_trust)
       values($1, $2, $3, $4, $5, $6, 0, $7, $8, 75, 75) returning *`,
      [
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
    // If bKash info provided and previously unset or changed
    if (cleanBkash && cleanBkash !== user.bkash_number) {
      await q(
        "update users set bkash_number=$2, bkash_type=$3, bkash_verified=0, phone=$2 where id=$1",
        [user.id, cleanBkash, cleanBkashType]
      );
      user.bkash_number = cleanBkash;
      user.bkash_type = cleanBkashType;
      user.bkash_verified = 0;
      user.phone = cleanBkash;
    }
  }

  if (user.is_suspended) {
    return fail(403, "This account is suspended. Please contact PakkaDeal support.");
  }

  const isUserAdmin = isAdmin(user);
  res.json({
    token: makeToken(user.id),
    user,
    is_admin: isUserAdmin,
    profile_complete: Boolean(user.bkash_number),
  });
});

router.get("/me", auth, (req, res) => {
  res.json({ user: req.user, is_admin: isAdmin(req.user) });
});

export default router;
