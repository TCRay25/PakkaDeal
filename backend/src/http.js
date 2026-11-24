import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { one, q } from "./db.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};

const sign = (data) => createHmac("sha256", config.secretKey).update(data).digest("base64url");

export function makeToken(userIdOrUser, tokenVersion = 1, expiresInSeconds = 30 * 60) {
  let uid = userIdOrUser;
  let version = tokenVersion;
  if (typeof userIdOrUser === "object" && userIdOrUser !== null) {
    uid = userIdOrUser.id;
    version = userIdOrUser.token_version ?? 1;
  }
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      uid,
      token_version: version,
      iat: now,
      exp: now + expiresInSeconds,
    })
  ).toString("base64url");
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function readToken(token) {
  try {
    const parts = String(token || "").trim().split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sig] = parts;
    const expectedSig = sign(`${headerB64}.${payloadB64}`);
    if (sig.length !== expectedSig.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) return null;

    return payload; // { uid, token_version, iat, exp }
  } catch {
    return null;
  }
}

export async function verifyUserToken(token) {
  const clean = String(token || "").replace(/^Bearer\s+/i, "").trim();
  const payload = clean ? readToken(clean) : null;
  if (!payload || !payload.uid) return null;
  const user = await one("select * from users where id=$1", [payload.uid]);
  if (!user) return null;
  const currentVersion = user.token_version ?? 1;
  if (payload.token_version !== currentVersion) {
    return null; // Revoked token
  }
  return user;
}

export async function revokeUserTokens(userId) {
  await q("update users set token_version = coalesce(token_version, 1) + 1 where id=$1", [userId]);
}

async function loadUser(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return verifyUserToken(token);
}

export const isAdmin = (user) => !!user && config.adminPhones.includes(user.phone);

export async function optionalAuth(req, _res, next) {
  req.user = await loadUser(req);
  next();
}

export async function auth(req, _res, next) {
  req.user = await loadUser(req);
  if (!req.user) fail(401, "Please log in");
  next();
}

export const role = (r) => (req, _res, next) => {
  if (req.user.role !== r) fail(403, `${r} account required`);
  next();
};

export const adminOnly = (req, _res, next) => {
  if (!isAdmin(req.user)) fail(403, "Admin only");
  next();
};
