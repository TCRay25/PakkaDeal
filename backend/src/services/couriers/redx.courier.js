import { BaseCourier } from "./base.courier.js";

export class RedXCourier extends BaseCourier {
  constructor() {
    super("RedX", "redx", {
      hasApi: true,
      manualTrackingUrl: "https://redx.com.bd/track-order/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(REDX|RX)[-_]?[0-9A-Z]{4,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "RedX Prefix (REDX/RX)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered")) return "delivered";
    if (s.includes("returned") || s.includes("return")) return "returned";
    if (s.includes("failed") || s.includes("hold")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("delivery-in-progress")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("sorting")) return "destination_hub";
    if (s.includes("in-transit") || s.includes("transit")) return "in_transit";
    if (s.includes("picked") || s.includes("pickup")) return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const token = process.env.REDX_API_TOKEN;
    const isProd = process.env.NODE_ENV === "production";

    if (!token) {
      if (isProd) {
        return {
          needsCredentials: true,
          error: "RedX API token not configured in production (.env: REDX_API_TOKEN)",
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`https://openapi.redx.com.bd/v1.0.0/parcels/tracking/${encodeURIComponent(trackingId)}`, {
        headers: {
          "API-ACCESS-TOKEN": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`RedX API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data };
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`RedX tracking request failed: ${err.message}`);
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
    const originalStatus = raw?.tracking_status || raw?.parcel_status || raw?.status || "in-transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.current_location || "RedX Regional Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.estimated_delivery_date || null,
      lastUpdated: raw?.updated_at || now,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] RedX live simulation" : "RedX API verified update",
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

    let status = "in-transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "returned";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "delivered";
    else if (clean.includes("FAIL")) status = "failed";
    else if (clean.includes("PICK")) status = "picked_up";

    return {
      isMock: true,
      data: {
        provider: "MOCK RedX",
        tracking_id: trackingId,
        tracking_status: status,
        current_location: status === "delivered" ? "Delivered at Address" : "RedX Gazipur Hub",
        updated_at: now,
      },
    };
  }
}
