import { one, q } from "../db.js";

export async function getBuyer(phone) {
  let b = await one("select * from buyer_stats where phone=$1", [phone]);
  if (!b) {
    await q("insert into buyer_stats(phone, delivered, refused, disputes, refunded, trust_score) values($1, 0, 0, 0, 0, 60)", [phone]);
    b = await one("select * from buyer_stats where phone=$1", [phone]);
  }
  return b;
}

export const successRatio = (b) => {
  const done = (b.delivered || 0) + (b.refused || 0);
  return done ? (b.delivered || 0) / done : 0.7;
};

export function score({ delivered = 0, refused = 0, disputes = 0 }) {
  const done = delivered + refused;
  const base = done === 0 ? 60 : 30 + (60 * delivered) / done + Math.min(done, 10);
  return Math.max(0, Math.min(100, Math.round(base - 10 * disputes)));
}

export async function bumpBuyer(phone, field) {
  const b = await getBuyer(phone);
  const current = b[field] || 0;
  const next = { ...b, [field]: current + 1 };
  const newScore = score(next);
  await q(`update buyer_stats set ${field}=$2, trust_score=$3 where phone=$1`, [phone, current + 1, newScore]);
  await q(`update users set buyer_trust=$2 where phone=$1`, [phone, newScore]);
}

export async function bumpSeller(userId, field) {
  let s = await one("select * from seller_stats where user_id=$1", [userId]);
  if (!s) {
    await q("insert into seller_stats(user_id, completed, refused, disputes, refunded, trust_score) values($1, 0, 0, 0, 0, 70)", [userId]);
    s = await one("select * from seller_stats where user_id=$1", [userId]);
  }
  const current = s[field] || 0;
  const next = { ...s, [field]: current + 1 };
  const done = next.completed + next.refused;
  const base = done === 0 ? 70 : 40 + (50 * next.completed) / done + Math.min(done, 10);
  const newScore = Math.max(0, Math.min(100, Math.round(base - 12 * next.disputes)));

  await q(`update seller_stats set ${field}=$2, trust_score=$3 where user_id=$1`, [userId, current + 1, newScore]);
  await q(`update users set seller_trust=$2 where id=$1`, [userId, newScore]);
}

export function depositFor(trust, charge) {
  if (trust >= 85) return 0;
  if (trust >= 70) return Math.floor(charge / 2);
  return charge;
}
