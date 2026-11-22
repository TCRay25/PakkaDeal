/**
 * Courier Adapter: SA Paribahan Parcel Service
 * 
 * Data Source: Physical Consignment / Money Receipt (MR)
 * Direct Public Tracking Link: https://saparibahan.com/
 * 
 * Limitations & Fallback Behavior:
 *   - SA Paribahan operates largely through branch-based counter registers and physical MR slips.
 *   - No developer REST API is available for real-time order lifecycle tracking.
 *   - Shipments via SA Paribahan default to "unverified" status with direct web link.
 *   - Strictly relies on seller's uploaded consignment slip and manual buyer receipt confirmation.
 */

import { BaseCourier } from "./base.courier.js";

export class SAParibahanCourier extends BaseCourier {
  constructor() {
    super("SA Paribahan", "saparibahan", {
      hasApi: false,
      manualTrackingUrl: "https://saparibahan.com/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(SA|MR|SAP|SAPARIBAHAN)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 90, patternName: "SA Paribahan Prefix" };
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
      message: "SA Paribahan requires manual verification. Consignment slip required.",
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
      originalStatus: "Manual Tracking (SA Paribahan Offline)",
      currentLocation: "Manual Verification Required",
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus: "unverified",
          originalStatus: "Manual Booking Slip Uploaded",
          location: "SA Paribahan Branch",
          note: "Offline courier tracking is unverified. Auto-release paused; requires buyer receipt confirmation.",
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
