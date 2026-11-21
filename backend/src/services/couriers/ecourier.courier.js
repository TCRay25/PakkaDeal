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
          needsCredentials: true,
          error: "eCourier API key not configured in production (.env: ECOURIER_API_KEY)",
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
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ecr: trackingId }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`eCourier API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data };
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`eCourier tracking request failed: ${err.message}`);
    }
  }

  normalize(rawObj, trackingId) {
    const now = new Date().toISOString();
    if (rawObj?.needsCredentials) {
      return {
        trackingId,
        courier: this.name,
        courierCode: this.code,
        standardizedStatus: "unknown",
        originalStatus: "Awaiting Live Credentials",
        currentLocation: "Credentials Required",
        estimatedDeliveryAt: null,
        lastUpdated: now,
        events: [],
        isMock: false,
        needsCredentials: true,
        error: rawObj.error,
      };
    }

    const isMock = !!rawObj?.isMock;
    const raw = rawObj?.data || rawObj;
    const originalStatus = raw?.status || "In Transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.hub || "eCourier Central Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: null,
      lastUpdated: now,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] eCourier live simulation" : "eCourier API verified update",
          occurredAt: now,
        },
      ],
      isMock,
      raw,
    };
  }

  mockResponse(trackingId) {
    const clean = String(trackingId).toUpperCase();
    const now = new Date().toISOString();

    let status = "In Transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "Returned";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "Delivered";
    else if (clean.includes("FAIL")) status = "Failed Delivery";
    else if (clean.includes("PICK")) status = "Picked Up";

    return {
      isMock: true,
      data: {
        provider: "MOCK eCourier",
        ecr: trackingId,
        status,
        hub: status === "Delivered" ? "Delivered to Customer" : "Dhaka Hub",
        updated_at: now,
      },
    };
  }
}
