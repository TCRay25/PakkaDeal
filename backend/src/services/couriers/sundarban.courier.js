/**
 * Courier Adapter: Sundarban Courier Services Pvt Ltd
 * 
 * Data Source: Physical Consignment Slips & Branch Records
 * Direct Public Tracking Link: https://www.sundarbancourierltd.com/
 * 
 * Limitations & Fallback Behavior:
 *   - Sundarban Courier does not provide an open public REST API for programmatic lookups.
 *     Their customer web portal is protected by anti-bot measures and session captchas.
 *   - In compliance with ethical/security guidelines, we DO NOT bypass captchas or scrape.
 *   - All shipments via Sundarban Courier default to "unverified" status with manual audit flags.
 *   - Funds release requires physical consignment slip upload by seller and confirmation of receipt by buyer.
 */

import { BaseCourier } from "./base.courier.js";

export class SundarbanCourier extends BaseCourier {
  constructor() {
    super("Sundarban Courier", "sundarban", {
      hasApi: false,
      manualTrackingUrl: "https://www.sundarbancourierltd.com/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(CN|SBN|SUNDARBAN)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 90, patternName: "Sundarban Prefix (CN/SBN)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    return "unverified";
  }

  async track(trackingId) {
    return {
      isManual: true,
      hasApi: false,
      isUnverified: true,
      trackingId,
      message: "Sundarban Courier requires manual verification. Consignment slip and buyer confirmation required.",
      manualTrackingUrl: this.manualTrackingUrl,
    };
  }

  normalize(rawObj, trackingId) {
    const now = new Date().toISOString();
    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus: "unverified",
      originalStatus: "Manual Tracking (Sundarban Offline)",
      currentLocation: "Manual Verification Required",
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus: "unverified",
          originalStatus: "Manual Booking Slip Uploaded",
          location: "Sundarban Booking Branch",
          note: "Offline courier tracking is unverified. 24h/72h timer does not auto-start; buyer manual receipt confirmation required.",
          occurredAt: now,
        },
      ],
      isManual: true,
      isMock: false,
      manualTrackingUrl: this.manualTrackingUrl,
      raw: rawObj,
    };
  }
}
