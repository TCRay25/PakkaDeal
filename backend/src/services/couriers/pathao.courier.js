/**
 * Courier Adapter: Pathao Courier
 * 
 * Data Source: Official Pathao Hermes Merchant API
 * Official Endpoint: https://api-hermes.pathao.com/aladdin/api/v1/orders/{trackingId}/info
 * Required Environment Credentials:
 *   - PATHAO_API_TOKEN (Bearer Token)
 * Direct Public Tracking Link: https://pathao.com/courier/
 * 
 * Limitations & Fallback Behavior:
 *   - Pathao requires merchant OAuth bearer token.
 *   - If credentials are not present in production, or if requests fail/timeout,
 *     it gracefully returns "unverified" status and provides the direct tracking URL.
 *   - Strict 5-second timeout via AbortController.
 */

import { BaseCourier } from "./base.courier.js";

export class PathaoCourier extends BaseCourier {
  constructor() {
    super("Pathao", "pathao", {
      hasApi: true,
      manualTrackingUrl: "https://pathao.com/courier/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(PT|PA|PATHAO)[-_]?[0-9A-Z]{3,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "Pathao Prefix (PT/PA/PATHAO)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered") || s === "delivered") return "delivered";
    if (s.includes("return") || s.includes("returned")) return "returned";
    if (s.includes("failed") || s.includes("hold") || s.includes("unreachable")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("assigned_for_delivery")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("sorting")) return "destination_hub";
    if (s.includes("in_transit") || s.includes("transit")) return "in_transit";
    if (s.includes("picked") || s.includes("pickup") || s === "order_placed") return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const token = process.env.PATHAO_API_TOKEN;
    const isProd = process.env.NODE_ENV === "production";

    if (!token) {
      if (isProd) {
        return {
          isUnverified: true,
          needsCredentials: true,
          error: "Pathao API token not configured in production (.env: PATHAO_API_TOKEN)",
          manualTrackingUrl: this.manualTrackingUrl,
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`https://api-hermes.pathao.com/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "PakkaDeal/1.0 (+https://pakkadeal.com; Escrow Engine)",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Pathao API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data: data?.data || data };
    } catch (err) {
      clearTimeout(timeout);
      return {
        isUnverified: true,
        error: `Pathao tracking request failed: ${err.message}`,
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
            note: "Please verify on Pathao website. Consignment slip required for safety.",
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
    const originalStatus = raw?.order_status || raw?.status || "in_transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.current_hub || raw?.hub_name || "Pathao Transit Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.estimated_delivery_at || null,
      lastUpdated: raw?.updated_at || now,
      manualTrackingUrl: this.manualTrackingUrl,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] Pathao live simulation" : "Pathao API verified update",
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

    let status = "in_transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "returned";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "delivered";
    else if (clean.includes("FAIL")) status = "failed";
    else if (clean.includes("PICK")) status = "picked";

    return {
      isMock: true,
      data: {
        consignment_id: trackingId,
        order_status: status,
        hub_name: status === "delivered" ? "Buyer Address" : "Tejgaon Sort Hub",
        updated_at: now,
      },
    };
  }
}
