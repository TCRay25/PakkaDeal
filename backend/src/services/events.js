import { q, one } from "../db.js";

/**
 * Log deal lifecycle event with status transition and actor attribution
 * @param {number} dealId
 * @param {string} kind
 * @param {string} note
 * @param {object} [meta]
 * @param {string} [meta.fromStatus]
 * @param {string} [meta.toStatus]
 * @param {string} [meta.actor] - 'seller' | 'buyer' | 'system' | 'courier' | 'admin'
 */
export async function log(dealId, kind, note = "", meta = {}) {
  const fromStatus = meta.fromStatus || "";
  const toStatus = meta.toStatus || kind;
  const actor = meta.actor || "system";

  return q(
    `insert into deal_events(deal_id, kind, from_status, to_status, actor, note)
     values($1, $2, $3, $4, $5, $6)`,
    [dealId, kind, fromStatus, toStatus, actor, note]
  );
}

/**
 * Dispatch in-app notification and simulated email
 */
export async function notify(phone, message, title = "PakkaDeal Update", dealCode = "") {
  // 1. In-app notification record
  await q(
    `insert into notifications(phone, title, message, deal_code)
     values($1, $2, $3, $4)`,
    [phone, title, message, dealCode]
  );

  // 2. Simulated email / SMS notification dispatcher
  const simulatedEmail = `${phone.replace(/\D/g, "")}@user.pakkadeal.com`;
  console.log(
    `[MOCK EMAIL & SMS DISPATCH] To: ${simulatedEmail} (${phone}) | Subject: [PakkaDeal] ${title} | Body: "${message}"`
  );
}

export async function notifySeller(sellerId, message, title = "PakkaDeal Update", dealCode = "") {
  const seller = await one("select phone, name from users where id=$1", [sellerId]);
  if (seller?.phone) {
    await notify(seller.phone, message, title, dealCode);
  }
}
