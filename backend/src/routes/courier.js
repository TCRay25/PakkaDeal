import { Router } from "express";
import { config } from "../config.js";
import { one } from "../db.js";
import { fail } from "../http.js";
import { applyCourier } from "../services/settle.js";
import { updateDealTracking } from "../services/tracking.service.js";

const router = Router();

function verifyWebhookAuth(req) {
  const incomingKey = req.headers["x-webhook-key"] || req.headers["x-webhook-secret"] || req.query.secret;
  if (incomingKey && incomingKey === config.webhookKey) {
    return true;
  }
  // If no webhookKey is set in dev, allow in non-production
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  return false;
}

/**
 * Universal courier webhook: POST /courier/webhook and POST /api/courier/webhook
 */
router.post("/webhook", async (req, res) => {
  if (!verifyWebhookAuth(req)) {
    fail(401, "Invalid webhook signature or x-webhook-key header");
  }

  const trackingId = req.body.tracking_id || req.body.tracking_code || req.body.consignment_id;
  const status = req.body.status || req.body.delivery_status || req.body.order_status;

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
