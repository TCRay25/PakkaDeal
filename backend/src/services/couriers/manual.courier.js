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
    return "in_transit";
  }

  async track(trackingId) {
    return {
      isManual: true,
      hasApi: false,
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
      standardizedStatus: "in_transit",
      originalStatus: "Manual Tracking",
      currentLocation: "Manual Verification Required",
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus: "in_transit",
          originalStatus: "Manual Courier Dispatch",
          location: "Manual Verification Required",
          note: "Consignment slip uploaded. Buyer confirmation required for release.",
          occurredAt: now,
        },
      ],
      isManual: true,
      isMock: false,
      raw: rawObj,
    };
  }
}
