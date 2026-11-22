/**
 * Courier Adapter: RedX Logistics
 * 
 * Data Source: Official RedX Open API
 * Official Endpoint: https://openapi.redx.com.bd/v1.0.0/parcels/tracking/{trackingId}
 * Required Environment Credentials:
 *   - REDX_API_TOKEN (Bearer Token)
 * Direct Public Tracking Link: https://redx.com.bd/track-order/
 * 
 * Limitations & Fallback Behavior:
 *   - RedX requires registered merchant API token.
 *   - When API token is absent or if requests time out, status falls back
 *     to "unverified" with direct website tracking link.
 *   - Strict 5-second timeout via AbortController.
 */

import { BaseCourier } from "./base.courier.js";

export class RedXCourier extends BaseCourier {
  constructor() {
    super("RedX", "redx", {
      hasApi: true,
      manualTrackingUrl: "https://redx.com.bd/track-order/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(REDX|RX)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "RedX Prefix (REDX/RX)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered")) return "delivered";
    if (s.includes("returned") || s.includes("return")) return "returned";
    if (s.includes("failed") || s.includes("hold")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("delivery-in-progress")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("sorting")) return "destination_hub";
    if (s.includes("in-transit") || s.includes("transit")) return "in_transit";
    if (s.includes("picked") || s.includes("pickup")) return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const token = process.env.REDX_API_TOKEN;
    const isProd = process.env.NODE_ENV === "production";

    if (!token) {
      if (isProd) {
        return {
          isUnverified: true,
          needsCredentials: true,
          error: "RedX API token not configured in production (.env: REDX_API_TOKEN)",
          manualTrackingUrl: this.manualTrackingUrl,
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`https://openapi.redx.com.bd/v1.0.0/parcels/tracking/${encodeURIComponent(trackingId)}`, {
        headers: {
          API_ACCESS_TOKEN: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "PakkaDeal/1.0 (+https://pakkadeal.com; Escrow Engine)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`RedX API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data: data?.tracking || data };
    } catch (err) {
      clearTimeout(timeout);
      return {
        isUnverified: true,
        error: `RedX tracking request failed: ${err.message}`,
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
            note: "Please verify on RedX website. Consignment slip required for safety.",
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
    const originalStatus = raw?.status || "in-transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.current_location || "RedX Regional Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.estimated_delivery_date || null,
      lastUpdated: raw?.updated_at || now,
      manualTrackingUrl: this.manualTrackingUrl,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] RedX live simulation" : "RedX API verified update",
          occurredAt: raw?.updated_at || now,
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
    else if (clean.includes("PICK")) status = "pickup-completed";

    return {
      isMock: true,
      data: {
        tracking_id: trackingId,
        status,
        current_location: status === "delivered" ? "Customer Destination" : "RedX Banani Hub",
        updated_at: now,
      },
    };
  }
}
