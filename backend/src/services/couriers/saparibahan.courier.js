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
    return "in_transit";
  }

  async track(trackingId) {
    return {
      isManual: true,
      hasApi: false,
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
      standardizedStatus: "in_transit",
      originalStatus: "Manual Tracking (SA Paribahan)",
      currentLocation: "Manual Verification Required",
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus: "in_transit",
          originalStatus: "Manual Dispatch Recorded",
          location: "SA Paribahan Parcel Branch",
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
