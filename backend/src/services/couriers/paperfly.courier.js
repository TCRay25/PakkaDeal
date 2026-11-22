/**
 * Courier Adapter: Paperfly
 * 
 * Data Source: Official Paperfly Tracking API
 * Official Endpoint: https://api.paperfly.com.bd/
 * Required Environment Credentials:
 *   - PAPERFLY_USERNAME
 *   - PAPERFLY_PASSWORD
 * Direct Public Tracking Link: https://paperfly.com.bd/tracking.php
 * 
 * Limitations & Fallback Behavior:
 *   - Requires Paperfly Basic Auth merchant credentials.
 *   - If credentials are not configured or request fails, falls back to
 *     "unverified" status with direct Paperfly tracking URL.
 *   - Strict 5-second timeout via AbortController.
 */

import { BaseCourier } from "./base.courier.js";

export class PaperflyCourier extends BaseCourier {
  constructor() {
    super("Paperfly", "paperfly", {
      hasApi: true,
      manualTrackingUrl: "https://paperfly.com.bd/tracking.php",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(FLY|PF|PAPERFLY)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "Paperfly Prefix (FLY/PF/PAPERFLY)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered") || s === "success") return "delivered";
    if (s.includes("return") || s.includes("returned")) return "returned";
    if (s.includes("failed") || s.includes("hold")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("dispatch")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("point")) return "destination_hub";
    if (s.includes("transit") || s.includes("in-transit")) return "in_transit";
    if (s.includes("picked") || s.includes("received")) return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const username = process.env.PAPERFLY_USERNAME;
    const password = process.env.PAPERFLY_PASSWORD;
    const isProd = process.env.NODE_ENV === "production";

    if (!username || !password) {
      if (isProd) {
        return {
          isUnverified: true,
          needsCredentials: true,
          error: "Paperfly API credentials not configured in production (.env: PAPERFLY_USERNAME, PAPERFLY_PASSWORD)",
          manualTrackingUrl: this.manualTrackingUrl,
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
      const res = await fetch("https://api.paperfly.com.bd/OrderTracking", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "User-Agent": "PakkaDeal/1.0 (+https://pakkadeal.com; Escrow Engine)",
        },
        body: JSON.stringify({ ReferenceNumber: trackingId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Paperfly API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data };
    } catch (err) {
      clearTimeout(timeout);
      return {
        isUnverified: true,
        error: `Paperfly tracking request failed: ${err.message}`,
        manualTrackingUrl: this.manualTrackingUrl,
      };
    }
  }

  normalize(rawObj, trackingId) {
    const now = new Date().toISOString();

    if (rawObj?.needsCredentials || rawObj?.isUnverified) {
      return {
        trackingId,
        courier: this.name,
        courierCode: this.code,
        standardizedStatus: "unverified",
        originalStatus: "Unverified (Requires Credentials or Manual Check)",
        currentLocation: "External Verification Required",
        estimatedDeliveryAt: null,
        lastUpdated: now,
        manualTrackingUrl: this.manualTrackingUrl,
        events: [
          {
            standardizedStatus: "unverified",
            originalStatus: "Tracking Not Auto-Verified",
            location: "External Courier Portal",
            note: "Please verify on Paperfly website. Consignment slip required for safety.",
            occurredAt: now,
          },
        ],
        isMock: false,
        needsCredentials: !!rawObj?.needsCredentials,
        error: rawObj.error,
      };
    }

    const isMock = !!rawObj?.isMock;
    const raw = rawObj?.data || rawObj;
    const originalStatus = raw?.Status || raw?.status || "in_transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.Point || raw?.hub || "Paperfly Dispatch Center";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.DeliveryDate || null,
      lastUpdated: raw?.LastUpdate || now,
      manualTrackingUrl: this.manualTrackingUrl,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] Paperfly live simulation" : "Paperfly API verified update",
          occurredAt: raw?.LastUpdate || now,
        },
      ],
      isMock,
      raw,
    };
  }

  mockResponse(trackingId) {
    const clean = String(trackingId).toUpperCase();
    const now = new Date().toISOString();

    let status = "in-transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "returned";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "delivered";
    else if (clean.includes("FAIL")) status = "failed";
    else if (clean.includes("PICK")) status = "picked";

    return {
      isMock: true,
      data: {
        ReferenceNumber: trackingId,
        Status: status,
        Point: status === "delivered" ? "Customer Doorstep" : "Uttara Point Hub",
        LastUpdate: now,
      },
    };
  }
}
