/**
 * Courier Adapter: eCourier
 * 
 * Data Source: Official eCourier Backoffice API
 * Official Endpoint: https://backoffice.ecourier.com.bd/api/track
 * Required Environment Credentials:
 *   - ECOURIER_API_KEY
 *   - ECOURIER_SECRET_KEY (optional depending on plan)
 *   - ECOURIER_USER_ID
 * Direct Public Tracking Link: https://ecourier.com.bd/
 * 
 * Limitations & Fallback Behavior:
 *   - Requires merchant API key.
 *   - When credentials are not found or endpoint fails/times out,
 *     falls back to "unverified" status with direct eCourier portal URL.
 *   - Strict 5-second timeout via AbortController.
 */

import { BaseCourier } from "./base.courier.js";

export class ECourierProvider extends BaseCourier {
  constructor() {
    super("eCourier", "ecourier", {
      hasApi: true,
      manualTrackingUrl: "https://ecourier.com.bd/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(EC|ECOURIER)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "eCourier Prefix (EC/ECOURIER)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered")) return "delivered";
    if (s.includes("return") || s.includes("returned")) return "returned";
    if (s.includes("fail") || s.includes("hold") || s.includes("cancel")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("delivery")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("sorting")) return "destination_hub";
    if (s.includes("transit")) return "in_transit";
    if (s.includes("pick") || s.includes("received")) return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const apiKey = process.env.ECOURIER_API_KEY;
    const isProd = process.env.NODE_ENV === "production";

    if (!apiKey) {
      if (isProd) {
        return {
          isUnverified: true,
          needsCredentials: true,
          error: "eCourier API key not configured in production (.env: ECOURIER_API_KEY)",
          manualTrackingUrl: this.manualTrackingUrl,
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch("https://backoffice.ecourier.com.bd/api/track", {
        method: "POST",
        headers: {
          "API-KEY": apiKey,
          "USER-ID": process.env.ECOURIER_USER_ID || "",
          "Content-Type": "application/json",
          "User-Agent": "PakkaDeal/1.0 (+https://pakkadeal.com; Escrow Engine)",
        },
        body: JSON.stringify({ ecrm_id: trackingId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`eCourier API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data };
    } catch (err) {
      clearTimeout(timeout);
      return {
        isUnverified: true,
        error: `eCourier tracking request failed: ${err.message}`,
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
            note: "Please verify on eCourier website. Consignment slip required for safety.",
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
    const originalStatus = raw?.status || raw?.delivery_status || "in_transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.hub || raw?.current_location || "eCourier Central Hub";

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
          note: isMock ? "[MOCK] eCourier live simulation" : "eCourier API verified update",
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
    else if (clean.includes("PICK")) status = "picked_up";

    return {
      isMock: true,
      data: {
        ecrm_id: trackingId,
        status,
        hub: status === "delivered" ? "Recipient Location" : "Dhanmondi Hub",
        updated_at: now,
      },
    };
  }
}
