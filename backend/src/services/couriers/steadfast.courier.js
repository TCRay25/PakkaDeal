/**
 * Courier Adapter: Steadfast Courier
 * 
 * Data Source: Official Steadfast Merchant API
 * Official Endpoint: https://api.steadfast.com.bd/v1/status_by_trackingcode/{trackingId}
 * Required Environment Credentials:
 *   - STEADFAST_API_KEY
 *   - STEADFAST_SECRET_KEY
 * Direct Public Tracking Link: https://steadfast.com.bd/t/{trackingId}
 * 
 * Limitations & Fallback Behavior:
 *   - Steadfast requires an active merchant API key and secret key.
 *   - If credentials are not configured in production, or if the API endpoint times out / fails,
 *     the status gracefully falls back to "unverified" with the official direct tracking URL.
 *   - Timeouts are strictly enforced at 5 seconds via AbortController.
 */

import { BaseCourier } from "./base.courier.js";

export class SteadfastCourier extends BaseCourier {
  constructor() {
    super("Steadfast", "steadfast", {
      hasApi: true,
      manualTrackingUrl: "https://steadfast.com.bd/t/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(SF|ST|STEADFAST)[-_]?[0-9A-Z]{4,12}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "Steadfast Prefix (SF/ST/STEADFAST)" };
    }
    if (/^[0-9]{8,10}$/.test(clean)) {
      return { matches: true, confidence: 75, patternName: "Steadfast Numeric Tracking ID" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered") || s === "delivered") return "delivered";
    if (s.includes("cancelled") || s.includes("returned") || s === "partial_delivered") return "returned";
    if (s.includes("failed") || s.includes("hold") || s.includes("rescheduled")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("rider")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("reached")) return "destination_hub";
    if (s.includes("transit") || s.includes("in_transit") || s === "in_review") return "in_transit";
    if (s.includes("picked") || s.includes("pickup") || s === "pending") return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const apiKey = process.env.STEADFAST_API_KEY;
    const secretKey = process.env.STEADFAST_SECRET_KEY;
    const isProd = process.env.NODE_ENV === "production";

    if (!apiKey || !secretKey) {
      if (isProd) {
        return {
          isUnverified: true,
          needsCredentials: true,
          error: "Steadfast API credentials not configured in production (.env: STEADFAST_API_KEY, STEADFAST_SECRET_KEY)",
          manualTrackingUrl: `https://steadfast.com.bd/t/${encodeURIComponent(trackingId)}`,
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`https://api.steadfast.com.bd/v1/status_by_trackingcode/${encodeURIComponent(trackingId)}`, {
        headers: {
          "Api-Key": apiKey,
          "Secret-Key": secretKey,
          "Content-Type": "application/json",
          "User-Agent": "PakkaDeal/1.0 (+https://pakkadeal.com; Escrow Engine)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Steadfast API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data };
    } catch (err) {
      clearTimeout(timeout);
      return {
        isUnverified: true,
        error: `Steadfast tracking request failed: ${err.message}`,
        manualTrackingUrl: `https://steadfast.com.bd/t/${encodeURIComponent(trackingId)}`,
      };
    }
  }

  normalize(rawObj, trackingId) {
    const now = new Date().toISOString();
    const manualUrl = `https://steadfast.com.bd/t/${encodeURIComponent(trackingId)}`;

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
        manualTrackingUrl: manualUrl,
        events: [
          {
            standardizedStatus: "unverified",
            originalStatus: "Tracking Not Auto-Verified",
            location: "External Courier Portal",
            note: "Please verify on Steadfast website. Seller proof required for safety.",
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
    const originalStatus = raw?.delivery_status || raw?.status || "in_transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.current_hub || raw?.hub || "Dhaka Sorting Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.estimated_delivery_at || null,
      lastUpdated: raw?.last_updated || now,
      manualTrackingUrl: manualUrl,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] Steadfast live simulation" : "Steadfast API verified update",
          occurredAt: raw?.last_updated || now,
        },
      ],
      isMock,
      raw,
    };
  }

  mockResponse(trackingId) {
    const clean = String(trackingId).toUpperCase();
    const now = new Date().toISOString();

    let status = "in_transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "cancelled";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "delivered";
    else if (clean.includes("FAIL")) status = "failed";
    else if (clean.includes("PICK")) status = "picked_up";

    return {
      isMock: true,
      data: {
        provider: "MOCK Steadfast",
        tracking_code: trackingId,
        delivery_status: status,
        current_hub: status === "delivered" ? "Customer Doorstep" : "Mirpur Central Hub",
        last_updated: now,
      },
    };
  }
}
