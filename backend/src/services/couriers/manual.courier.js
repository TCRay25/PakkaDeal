/**
 * Courier Adapter: Other / Local Courier (Manual Audit)
 * 
 * Data Source: Seller Consignment Slip Photo & Buyer Handover
 * Direct Public Tracking Link: None (Local/Unrecognized courier)
 * 
 * Limitations & Fallback Behavior:
 *   - Used when seller selects "Other" or an unrecognized local courier service.
 *   - Status is always "unverified".
 *   - Automated delivery transitions are disabled; fund release strictly requires
 *     buyer's manual confirmation or admin dispute resolution.
 */

import { BaseCourier } from "./base.courier.js";

export class ManualCourier extends BaseCourier {
  constructor() {
    super("Other", "other", {
      hasApi: false,
      manualTrackingUrl: "",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (clean.startsWith("MANUAL-") || clean.length >= 3) {
      return { matches: true, confidence: 30, patternName: "Fallback Manual Identifier" };
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
      message: "Manual tracking. Consignment slip photo verification required.",
    };
  }

  normalize(rawObj, trackingId) {
    const now = new Date().toISOString();
    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus: "unverified",
      originalStatus: "Manual Tracking",
      currentLocation: "Manual Verification Required",
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus: "unverified",
          originalStatus: "Manual Courier Dispatch",
          location: "Manual Verification Required",
          note: "Consignment slip uploaded. Tracking is unverified; buyer manual confirmation required for release.",
          occurredAt: now,
        },
      ],
      isManual: true,
      isMock: false,
      manualTrackingUrl: "",
      raw: rawObj,
    };
  }
}
