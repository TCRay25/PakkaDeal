import { q, one } from "../db.js";
import { emitToUser, emitToDeal, emitToAdmin } from "./socket.js";

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

  const res = await q(
    `insert into deal_events(deal_id, kind, from_status, to_status, actor, note)
     values($1, $2, $3, $4, $5, $6)`,
    [dealId, kind, fromStatus, toStatus, actor, note]
  );

  try {
    const deal = await one("select code from deals where id=$1", [dealId]);
    if (deal?.code) {
      const payload = {
        dealId,
        code: deal.code,
        kind,
        from_status: fromStatus,
        to_status: toStatus,
        actor,
        note,
        created_at: new Date().toISOString(),
      };
      emitToDeal(deal.code, "deal:event", payload);
      emitToDeal(deal.code, "deal:status_changed", payload);
      emitToDeal(deal.code, "deal:updated", { code: deal.code, dealId, status: toStatus });
      emitToAdmin("admin:deal_updated", payload);
    }
  } catch (err) {
    // Non-blocking for logging
  }

  return res;
}

/**
 * Dispatch in-app notification and simulated email
 */
export async function notify(phone, message, title = "PakkaDeal Update", dealCode = "") {
  // 1. In-app notification record
  let notifId = null;
  try {
    const res = await q(
      `insert into notifications(phone, title, message, deal_code)
       values($1, $2, $3, $4)`,
      [phone, title, message, dealCode]
    );
    notifId = res?.[0]?.id || Date.now();
  } catch (err) {
    if (err.message && (err.message.includes("title") || err.message.includes("deal_code"))) {
      await q("alter table notifications add column if not exists title text not null default 'PakkaDeal Update'").catch(() => {});
      await q("alter table notifications add column if not exists deal_code text not null default ''").catch(() => {});
      const res = await q(
        `insert into notifications(phone, title, message, deal_code)
         values($1, $2, $3, $4)`,
        [phone, title, message, dealCode]
      ).catch(() => {});
      notifId = res?.[0]?.id || Date.now();
    } else {
      console.warn("Notification insert error:", err.message);
    }
  }

  // Real-time Socket.IO dispatch
  try {
    emitToUser(phone, "notification:new", {
      id: notifId,
      phone,
      title,
      message,
      deal_code: dealCode,
      is_read: 0,
      created_at: new Date().toISOString(),
    });
    if (dealCode) {
      emitToDeal(dealCode, "deal:notification", {
        id: notifId,
        title,
        message,
        deal_code: dealCode,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    // Non-blocking for notification emission
  }

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
