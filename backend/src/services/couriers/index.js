import { SteadfastCourier } from "./steadfast.courier.js";
import { PathaoCourier } from "./pathao.courier.js";
import { RedXCourier } from "./redx.courier.js";
import { PaperflyCourier } from "./paperfly.courier.js";
import { ECourierProvider } from "./ecourier.courier.js";
import { SundarbanCourier } from "./sundarban.courier.js";
import { SAParibahanCourier } from "./saparibahan.courier.js";
import { ManualCourier } from "./manual.courier.js";

export const couriers = [
  new SteadfastCourier(),
  new PathaoCourier(),
  new RedXCourier(),
  new PaperflyCourier(),
  new ECourierProvider(),
  new SundarbanCourier(),
  new SAParibahanCourier(),
  new ManualCourier(),
];

export const courierMap = new Map();
for (const c of couriers) {
  courierMap.set(c.code.toLowerCase(), c);
  courierMap.set(c.name.toLowerCase(), c);
}

/**
 * Retrieve courier by code or display name
 * @param {string} nameOrCode
 * @returns {BaseCourier}
 */
export function getCourier(nameOrCode = "other") {
  const key = String(nameOrCode || "").trim().toLowerCase();
  return courierMap.get(key) || courierMap.get("other");
}
