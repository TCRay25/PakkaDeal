import { Router } from "express";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { one } from "../db.js";
import { fail } from "../http.js";
import { applyCourier } from "../services/settle.js";
import { updateDealTracking } from "../services/tracking.service.js";

const router = Router();

function safeCompare(a, b) {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") return false;
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

export function verifyWebhookAuth(req) {
  // Always require a secret regardless of NODE_ENV, reject if WEBHOOK_KEY is unset
  if (!config.webhookKey || typeof config.webhookKey !== "string" || config.webhookKey.trim().length < 32) {
    return false;
  }

  // 1. Prefer HMAC-SHA256 over the raw body per courier
  const signature =
    req.headers["x-webhook-signature"] ||
    req.headers["x-hub-signature-256"] ||
    req.headers["x-signature"] ||
    req.headers["x-courier-signature"];

  if (signature) {
    const cleanSig = String(signature).replace(/^sha256=/i, "").trim();
    const raw = req.rawBody || (req.body ? JSON.stringify(req.body) : "");
    const expectedSigHex = createHmac("sha256", config.webhookKey).update(raw).digest("hex");
    if (safeCompare(cleanSig, expectedSigHex)) {
      return true;
    }
  }

  // 2. Secret read ONLY from a header (never from query string)
  const incomingKey =
    req.headers["x-webhook-key"] ||
    req.headers["x-webhook-secret"] ||
    req.headers["x-api-key"];

  if (incomingKey && safeCompare(String(incomingKey).trim(), config.webhookKey.trim())) {
    return true;
  }

  return false;
}

/**
 * Universal courier webhook: POST /courier/webhook and POST /api/courier/webhook
 */
router.post("/webhook", async (req, res) => {
  if (!verifyWebhookAuth(req)) {
    fail(401, "Invalid webhook signature or secret header");
  }

  const trackingId = req.body?.tracking_id || req.body?.tracking_code || req.body?.consignment_id;
  const status = req.body?.status || req.body?.delivery_status || req.body?.order_status;

  if (!trackingId) {
    fail(400, "tracking_id is required in webhook payload");
  }

  let deal = await one("select * from deals where tracking_id = $1", [trackingId]);
  if (!deal) {
    deal = await one("select * from deals where return_tracking_id = $1", [trackingId]);
  }

  if (!deal) {
    fail(404, `No deal found matching tracking ID: ${trackingId}`);
  }

  const updatedTracking = await updateDealTracking(deal, "webhook", req.body);
  const refreshed = await one("select * from deals where id = $1", [deal.id]);

  res.json({
    ok: true,
    deal_code: refreshed.code,
    status: refreshed.status,
    standardized_status: refreshed.standardized_status,
    raw_status: refreshed.raw_courier_status || status,
    tracking: updatedTracking,
  });
});

/**
 * Courier-specific webhook: POST /courier/webhook/:courier
 */
router.post("/webhook/:courier", async (req, res) => {
  if (!verifyWebhookAuth(req)) {
    fail(401, "Invalid webhook signature or secret header");
  }

  const courierName = req.params.courier;
  const body = req.body || {};

  // Extract tracking identifier across different courier webhook schemas
  const trackingId =
    body.tracking_id ||
    body.tracking_code ||
    body.consignment_id ||
    body.TrackingNumber ||
    body.ecr;

  if (!trackingId) {
    fail(400, `Could not find tracking identifier in ${courierName} webhook payload`);
  }

  let deal = await one("select * from deals where tracking_id = $1", [trackingId]);
  if (!deal) {
    deal = await one("select * from deals where return_tracking_id = $1", [trackingId]);
  }

  if (!deal) {
    fail(404, `No deal found for tracking ID: ${trackingId}`);
  }

  const normalized = await updateDealTracking(deal, "webhook", body);
  const refreshed = await one("select * from deals where id = $1", [deal.id]);

  res.json({
    ok: true,
    courier: courierName,
    deal_code: refreshed.code,
    status: refreshed.status,
    standardized_status: refreshed.standardized_status,
    tracking: normalized,
  });
});

export default router;
