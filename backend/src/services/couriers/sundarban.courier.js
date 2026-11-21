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
    return "in_transit";
  }

  async track(trackingId) {
    return {
      isManual: true,
      hasApi: false,
      trackingId,
      message: "Sundarban Courier requires manual verification. Consignment slip required.",
      manualTrackingUrl: this.manualTrackingUrl,
    };
  }

  normalize(rawObj, trackingId) {
    const now = new Date().toISOString();
    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus: "in_transit",
      originalStatus: "Manual Tracking (Sundarban)",
      currentLocation: "Manual Verification Required",
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus: "in_transit",
          originalStatus: "Manual Dispatch Recorded",
          location: "Sundarban Booking Branch",
          note: "Requires buyer receipt confirmation. 24h timer does not auto-start.",
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
