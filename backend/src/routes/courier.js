import { Router } from "express";
import { config } from "../config.js";
import { one } from "../db.js";
import { fail } from "../http.js";
import { applyCourier } from "../services/settle.js";

const router = Router();

/**
 * Steadfast / Pathao style Courier Webhook
 * Header: x-webhook-key: <key>
 * Body: { tracking_id: "...", status: "picked_up" | "in_transit" | "delivered" | "refused" | "returned" }
 */
router.post("/webhook", async (req, res) => {
  const incomingKey = req.headers["x-webhook-key"];
  if (incomingKey !== config.webhookKey) {
    fail(401, "Invalid webhook signature or x-webhook-key header");
  }

  const { tracking_id, status } = req.body;
  if (!tracking_id || !status) {
    fail(400, "tracking_id and status are required");
  }

  // Look for either outward tracking or return tracking
  let deal = await one("select * from deals where tracking_id = $1", [tracking_id]);
  if (!deal) {
    deal = await one("select * from deals where return_tracking_id = $1", [tracking_id]);
  }

  if (!deal) {
    fail(404, `No deal found matching tracking ID: ${tracking_id}`);
  }

  const updated = await applyCourier(deal, status);
  res.json({
    ok: true,
    deal_code: updated?.code || deal.code,
    status: updated?.status || deal.status,
    courier_status: updated?.courier_status || status,
  });
});

export default router;
