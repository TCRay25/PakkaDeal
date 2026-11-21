import { BaseCourier } from "./base.courier.js";

export class PathaoCourier extends BaseCourier {
  constructor() {
    super("Pathao", "pathao", {
      hasApi: true,
      manualTrackingUrl: "https://pathao.com/courier/",
    });
  }

  detect(trackingId) {
    const clean = String(trackingId || "").trim().toUpperCase();
    if (/^(PT|PA|PATHAO)[-_]?[0-9A-Z]{3,14}$/i.test(clean)) {
      return { matches: true, confidence: 95, patternName: "Pathao Prefix (PT/PA/PATHAO)" };
    }
    return { matches: false, confidence: 0, patternName: "none" };
  }

  mapStatus(rawStatus) {
    const s = String(rawStatus || "").toLowerCase().trim();
    if (s.includes("delivered") || s === "delivered") return "delivered";
    if (s.includes("return") || s.includes("returned")) return "returned";
    if (s.includes("failed") || s.includes("hold") || s.includes("unreachable")) return "delivery_failed";
    if (s.includes("out_for_delivery") || s.includes("assigned_for_delivery")) return "out_for_delivery";
    if (s.includes("hub") || s.includes("sorting")) return "destination_hub";
    if (s.includes("in_transit") || s.includes("transit")) return "in_transit";
    if (s.includes("picked") || s.includes("pickup") || s === "order_placed") return "picked_up";
    return "order_created";
  }

  async track(trackingId) {
    const token = process.env.PATHAO_API_TOKEN;
    const isProd = process.env.NODE_ENV === "production";

    if (!token) {
      if (isProd) {
        return {
          needsCredentials: true,
          error: "Pathao API token not configured in production (.env: PATHAO_API_TOKEN)",
        };
      }
      return this.mockResponse(trackingId);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`https://api-hermes.pathao.com/aladdin/api/v1/orders/${encodeURIComponent(trackingId)}/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Pathao API returned HTTP ${res.status}`);
      const data = await res.json();
      return { isMock: false, data: data?.data || data };
    } catch (err) {
      clearTimeout(timeout);
      throw new Error(`Pathao tracking request failed: ${err.message}`);
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
    const originalStatus = raw?.order_status || raw?.status || "In_Transit";
    const standardizedStatus = this.mapStatus(originalStatus);
    const location = raw?.current_hub || "Pathao Transit Hub";

    return {
      trackingId,
      courier: this.name,
      courierCode: this.code,
      standardizedStatus,
      originalStatus,
      currentLocation: location,
      estimatedDeliveryAt: raw?.estimated_delivery_time || null,
      lastUpdated: raw?.updated_at || now,
      events: [
        {
          standardizedStatus,
          originalStatus,
          location,
          note: isMock ? "[MOCK] Pathao live simulation" : "Pathao Aladdin API verified update",
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

    let status = "In_Transit";
    if (clean.includes("RET") || clean.includes("REFUS")) status = "Returned";
    else if (clean.includes("DELIV") || clean.endsWith("99")) status = "Delivered";
    else if (clean.includes("FAIL")) status = "Failed";
    else if (clean.includes("PICK")) status = "Picked";

    return {
      isMock: true,
      data: {
        provider: "MOCK Pathao",
        consignment_id: trackingId,
        order_status: status,
        current_hub: status === "Delivered" ? "Recipient Location" : "Tejgaon Sorting Hub",
        updated_at: now,
      },
    };
  }
}
