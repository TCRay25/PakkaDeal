import { q, one } from "../db.js";

/**
 * Base Courier Adapter interface
 * getStatus(trackingId) -> Promise<{ status: 'picked_up' | 'in_transit' | 'delivered' | 'returned' | 'unknown', lastUpdate: string, raw: object }>
 */
export class BaseCourierAdapter {
  constructor(name) {
    this.name = name;
  }

  async getStatus(trackingId) {
    throw new Error("getStatus() must be implemented by courier adapter");
  }
}

/**
 * Steadfast Courier Adapter
 */
export class SteadfastAdapter extends BaseCourierAdapter {
  constructor() {
    super("Steadfast");
  }

  async getStatus(trackingId) {
    const cleanId = String(trackingId || "").toUpperCase();
    const now = new Date().toISOString();

    if (cleanId.includes("REFUS") || cleanId.includes("RET")) {
      return { status: "returned", lastUpdate: now, raw: { provider: "Steadfast", code: 200, delivery_status: "cancelled" } };
    }
    if (cleanId.includes("DELIV") || cleanId.endsWith("99")) {
      return { status: "delivered", lastUpdate: now, raw: { provider: "Steadfast", code: 200, delivery_status: "delivered" } };
    }
    if (cleanId.includes("PICK")) {
      return { status: "picked_up", lastUpdate: now, raw: { provider: "Steadfast", code: 200, delivery_status: "picked" } };
    }

    return {
      status: "in_transit",
      lastUpdate: now,
      raw: { provider: "Steadfast", code: 200, consignment_id: cleanId, delivery_status: "in_review" },
    };
  }
}

/**
 * Pathao Courier Adapter
 */
export class PathaoAdapter extends BaseCourierAdapter {
  constructor() {
    super("Pathao");
  }

  async getStatus(trackingId) {
    const cleanId = String(trackingId || "").toUpperCase();
    const now = new Date().toISOString();

    if (cleanId.includes("REFUS") || cleanId.includes("RET")) {
      return { status: "returned", lastUpdate: now, raw: { provider: "Pathao", order_status: "Returned" } };
    }
    if (cleanId.includes("DELIV") || cleanId.endsWith("99")) {
      return { status: "delivered", lastUpdate: now, raw: { provider: "Pathao", order_status: "Delivered" } };
    }
    return {
      status: "in_transit",
      lastUpdate: now,
      raw: { provider: "Pathao", consignment_id: cleanId, order_status: "In_Transit" },
    };
  }
}

/**
 * RedX Courier Adapter
 */
export class RedXAdapter extends BaseCourierAdapter {
  constructor() {
    super("RedX");
  }

  async getStatus(trackingId) {
    const cleanId = String(trackingId || "").toUpperCase();
    const now = new Date().toISOString();

    if (cleanId.includes("REFUS") || cleanId.includes("RET")) {
      return { status: "returned", lastUpdate: now, raw: { provider: "RedX", parcel_status: "returned" } };
    }
    if (cleanId.includes("DELIV") || cleanId.endsWith("99")) {
      return { status: "delivered", lastUpdate: now, raw: { provider: "RedX", parcel_status: "delivered" } };
    }
    return {
      status: "in_transit",
      lastUpdate: now,
      raw: { provider: "RedX", tracking_id: cleanId, parcel_status: "in-transit" },
    };
  }
}

/**
 * Paperfly Courier Adapter
 */
export class PaperflyAdapter extends BaseCourierAdapter {
  constructor() {
    super("Paperfly");
  }

  async getStatus(trackingId) {
    const cleanId = String(trackingId || "").toUpperCase();
    const now = new Date().toISOString();

    if (cleanId.includes("REFUS") || cleanId.includes("RET")) {
      return { status: "returned", lastUpdate: now, raw: { provider: "Paperfly", PaperflyStatus: "Returned" } };
    }
    if (cleanId.includes("DELIV") || cleanId.endsWith("99")) {
      return { status: "delivered", lastUpdate: now, raw: { provider: "Paperfly", PaperflyStatus: "Delivered" } };
    }
    return {
      status: "in_transit",
      lastUpdate: now,
      raw: { provider: "Paperfly", TrackingNumber: cleanId, PaperflyStatus: "In Transit" },
    };
  }
}

/**
 * Manual / Other Courier Adapter
 */
export class ManualCourierAdapter extends BaseCourierAdapter {
  constructor() {
    super("Other");
  }

  async getStatus(trackingId) {
    return {
      status: "manual_review",
      lastUpdate: new Date().toISOString(),
      raw: { provider: "Other", trackingId, manual: true },
    };
  }
}

const adapters = {
  steadfast: new SteadfastAdapter(),
  pathao: new PathaoAdapter(),
  redx: new RedXAdapter(),
  paperfly: new PaperflyAdapter(),
  other: new ManualCourierAdapter(),
};

/**
 * Retrieve courier adapter by name
 * @param {string} name
 * @returns {BaseCourierAdapter}
 */
export function getAdapter(name = "Steadfast") {
  const key = String(name).toLowerCase().trim();
  return adapters[key] || adapters.steadfast;
}

/**
 * Scheduled worker to poll active shipments
 * @param {Function} applyCourierFn
 */
export async function pollActiveShipments(applyCourierFn) {
  try {
    const activeDeals = await q(
      `select * from deals
       where status in ('shipped', 'return_shipped')
         and is_manual_courier = 0
         and tracking_id != ''`
    );

    for (const deal of activeDeals) {
      const isReturn = deal.status === "return_shipped";
      const courierName = isReturn ? deal.return_courier_name : deal.courier_name;
      const trackingId = isReturn ? deal.return_tracking_id : deal.tracking_id;

      if (!trackingId) continue;

      const adapter = getAdapter(courierName);
      const res = await adapter.getStatus(trackingId);

      if (res && res.status && res.status !== "unknown" && res.status !== "manual_review") {
        const currentCourierStatus = isReturn ? deal.return_courier_status : deal.courier_status;
        if (res.status !== currentCourierStatus) {
          console.log(`[COURIER POLLER] Polled update for deal #${deal.code} (${courierName}): ${currentCourierStatus} -> ${res.status}`);
          await applyCourierFn(deal, res.status);
        }
      }
    }
  } catch (err) {
    console.error("[COURIER POLLER ERROR]", err.message);
  }
}
