import { Router } from "express";
import { config } from "../config.js";
import { one, q } from "../db.js";
import { auth, fail, isAdmin, makeToken } from "../http.js";

const router = Router();
export const PHONE = /^01[3-9]\d{8}$/;

router.post("/send-otp", (req, res) => {
  const phone = (req.body.phone || "").trim();
  if (!PHONE.test(phone)) fail(400, "Enter a valid 11-digit Bangladesh mobile number (e.g. 017XXXXXXXX)");
  res.json({ sent: true, message: `OTP sent. Use demo code: ${config.demoOtp}` });
});

router.post("/verify", async (req, res) => {
  const { phone, otp, name = "", role = "seller" } = req.body;
  const cleanPhone = (phone || "").trim();
  if (!PHONE.test(cleanPhone)) fail(400, "Enter a valid 11-digit Bangladesh mobile number");
  if (otp !== config.demoOtp) fail(400, "Invalid verification code. Enter " + config.demoOtp);
  if (!["seller", "buyer"].includes(role)) fail(400, "Role must be seller or buyer");

  let user = await one("select * from users where phone=$1", [cleanPhone]);
  if (!user) {
    user = await one(
      `insert into users(phone, name, role, page_name, seller_trust, buyer_trust)
       values($1, $2, $3, $4, 70, 60) returning *`,
      [cleanPhone, name.trim() || (role === "seller" ? "Seller " + cleanPhone.slice(-4) : "Buyer " + cleanPhone.slice(-4)),
       role, role === "seller" ? name.trim() : ""]
    );
  } else if (name && !user.name) {
    user = await one("update users set name=$2 where id=$1 returning *", [user.id, name.trim()]);
  }

  if (user.is_suspended) {
    fail(403, "This account is suspended. Please contact PakkaDeal support.");
  }

  const isUserAdmin = isAdmin(user);
  res.json({
    token: makeToken(user.id),
    user,
    is_admin: isUserAdmin,
  });
});

router.get("/me", auth, (req, res) => {
  res.json({ user: req.user, is_admin: isAdmin(req.user) });
});

router.post("/switch-role", auth, async (req, res) => {
  const targetRole = req.body.role === "buyer" ? "buyer" : "seller";
  const updated = await one("update users set role=$2 where id=$1 returning *", [req.user.id, targetRole]);
  res.json({ user: updated, is_admin: isAdmin(updated) });
});

export default router;
