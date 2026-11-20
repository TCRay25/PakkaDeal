import { q, one } from "../db.js";

export const log = (dealId, kind, note = "") =>
  q("insert into deal_events(deal_id, kind, note) values($1, $2, $3)", [dealId, kind, note]);

export const notify = (phone, message, title = "PakkaDeal Update", dealCode = "") =>
  q("insert into notifications(phone, title, message, deal_code) values($1, $2, $3, $4)", [phone, title, message, dealCode]);

export async function notifySeller(sellerId, message, title = "PakkaDeal Update", dealCode = "") {
  const seller = await one("select phone from users where id=$1", [sellerId]);
  if (seller?.phone) {
    await notify(seller.phone, message, title, dealCode);
  }
}
