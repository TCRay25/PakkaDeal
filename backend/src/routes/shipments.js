import { Router } from "express";
import { detectCourier } from "../services/tracking.service.js";
import { couriers } from "../services/couriers/index.js";
import { fail } from "../http.js";

const router = Router();

/**
 * POST /api/shipments/detect and /shipments/detect
 * Body: { trackingId: string }
 */
router.post("/detect", (req, res) => {
  const trackingId = (req.body.trackingId || req.body.tracking_id || "").trim();
  if (!trackingId) {
    fail(400, "trackingId is required");
  }

  const result = detectCourier(trackingId);
  res.json(result);
});

/**
 * GET /api/shipments/couriers
 * Lists all supported couriers, their API availability, and manual tracking URLs
 */
router.get("/couriers", (_req, res) => {
  const list = couriers.map((c) => ({
    name: c.name,
    code: c.code,
    hasApi: c.hasApi,
    manualTrackingUrl: c.manualTrackingUrl,
  }));
  res.json(list);
});

export default router;
