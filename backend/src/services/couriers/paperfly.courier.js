import { BaseCourier } from "./base.courier.js";

export class PaperflyCourier extends BaseCourier {
  constructor() {
    super("Paperfly", "paperfly", {
      hasApi: true,
      manualTrackingUrl: "https://paperfly.com.bd/tracking.php",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(FLY|PF|PAPERFLY)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "Paperfly Prefix (FLY/PF/PAPERFLY)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered") || s === "success") return "delivered";
    if (s.includes("return") || s.includes("returned")) return "returned";
    if (s.includes("failed") || s.includes("hold")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("dispatch")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("point")) return "destination_hub";
    if (s.includes("transit") || s.includes("in-transit")) return "in_transit";
    if (s.includes("picked") || s.includes("received")) return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const username = process.env.PAPERFLY_USERNAME;
    const password = process.env.PAPERFLY_PASSWORD;
    const isProd = process.env.NODE_ENV === "production";

    if (!username || !password) {
      if (isProd) {
        return {
          needsCredentials: true,
          error: "Paperfly API credentials not configured in production (.env: PAPERFLY_USERNAME, PAPERFLY_PASSWORD)",
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
      const res = await fetch(`https://api.paperfly.com.bd/Tracking/GetTrackingDetails/${encodeURIComponent(trackingId)}`, {
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Paperfly API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data };
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`Paperfly tracking request failed: ${err.message}`);
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
    const originalStatus = raw?.PaperflyStatus || raw?.status || "In Transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.current_point || "Paperfly Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.estimated_delivery || null,
      lastUpdated: raw?.last_updated || now,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] Paperfly live simulation" : "Paperfly API verified update",
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

    let status = "In Transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "Returned";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "Delivered";
    else if (clean.includes("FAIL")) status = "Failed";
    else if (clean.includes("PICK")) status = "Picked Up";

    return {
      isMock: true,
      data: {
        provider: "MOCK Paperfly",
        TrackingNumber: trackingId,
        PaperflyStatus: status,
        current_point: status === "Delivered" ? "Delivered at Destination" : "Central Sorting Hub",
        last_updated: now,
      },
    };
  }
}
