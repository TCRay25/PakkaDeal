import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { one } from "./db.js";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };

const sign = (body) => createHmac("sha256", config.secretKey).update(body).digest("hex");

export function makeToken(userId) {
  const body = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 7 * 864e5 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(token) {
  try {
    const [body, sig] = token.split(".");
    const good = sign(body);
    if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.exp > Date.now() ? data.uid : null;
  } catch { return null; }
}

export async function verifyUserToken(token) {
  const clean = String(token || "").replace(/^Bearer\s+/i, "").trim();
  const uid = clean ? readToken(clean) : null;
  return uid ? one("select * from users where id=$1", [uid]) : null;
}

async function loadUser(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return verifyUserToken(token);
}

export const isAdmin = (user) => !!user && config.adminPhones.includes(user.phone);

export async function optionalAuth(req, _res, next) { req.user = await loadUser(req); next(); }
export async function auth(req, _res, next) {
  req.user = await loadUser(req);
  if (!req.user) fail(401, "Please log in");
  next();
}
export const role = (r) => (req, _res, next) => { if (req.user.role !== r) fail(403, `${r} account required`); next(); };
export const adminOnly = (req, _res, next) => { if (!isAdmin(req.user)) fail(403, "Admin only"); next(); };
