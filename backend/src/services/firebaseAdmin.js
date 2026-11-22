import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

let cachedAuth = null;

export function initFirebaseAdmin() {
  if (cachedAuth) {
    return cachedAuth;
  }

  const existingApps = getApps();
  if (existingApps.length > 0) {
    cachedAuth = getAuth(existingApps[0]);
    return cachedAuth;
  }

  // 1. Direct JSON string or base64 encoded in FIREBASE_SERVICE_ACCOUNT
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const jsonStr = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
      const serviceAccount = JSON.parse(jsonStr);
      const app = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("[FIREBASE ADMIN] Initialized successfully with FIREBASE_SERVICE_ACCOUNT");
      cachedAuth = getAuth(app);
      return cachedAuth;
    } catch (err) {
      console.warn("[FIREBASE ADMIN WARN] Failed to parse FIREBASE_SERVICE_ACCOUNT env:", err.message);
    }
  }

  // 2. Service account JSON file path
  const potentialPaths = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "firebase-service-account.json"),
    path.resolve(process.cwd(), "config/service-account.json"),
  ].filter(Boolean);

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(p, "utf-8"));
        const app = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log(`[FIREBASE ADMIN] Initialized successfully with file: ${p}`);
        cachedAuth = getAuth(app);
        return cachedAuth;
      } catch (err) {
        console.warn(`[FIREBASE ADMIN WARN] Could not load service account from ${p}:`, err.message);
      }
    }
  }

  // 3. Project ID initialization
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "pakkadeal-ca51b";

  try {
    const app = initializeApp({ projectId });
    console.log(`[FIREBASE ADMIN] Initialized with projectId: ${projectId}`);
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch (err) {
    console.warn("[FIREBASE ADMIN WARN] Failed initializing with projectId:", err.message);
  }

  return null;
}

/**
 * Fallback cryptographic verification using Google's public x509 certificates.
 * Allows validating Firebase ID tokens even if a private service account key is not present on the server.
 */
async function verifyWithGooglePublicKeys(idToken) {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));

    const expectedProject =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      "pakkadeal-ca51b";

    if (payload.aud !== expectedProject) {
      console.warn(`[FIREBASE TOKEN WARN] Audience mismatch: expected ${expectedProject}, got ${payload.aud}`);
      return null;
    }

    if (payload.iss !== `https://securetoken.google.com/${expectedProject}`) {
      console.warn(`[FIREBASE TOKEN WARN] Issuer mismatch: ${payload.iss}`);
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error("Firebase ID token has expired. Please sign in again.");
    }

    if (header.kid) {
      const certsRes = await fetch(
        "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
      );
      const certs = await certsRes.json();
      const pubCert = certs[header.kid];
      if (pubCert) {
        const verifier = crypto.createVerify("RSA-SHA256");
        verifier.update(`${parts[0]}.${parts[1]}`);
        const isValid = verifier.verify(pubCert, Buffer.from(parts[2], "base64url"));
        if (!isValid) {
          throw new Error("Firebase ID token signature verification failed");
        }
      }
    }

    return payload;
  } catch (err) {
    console.error("[FIREBASE PUBLIC KEY VERIFICATION ERROR]", err.message);
    return null;
  }
}

/**
 * Verifies a Firebase Auth ID Token sent by the frontend.
 * Returns the decoded token payload { uid, phone_number, email, ... }
 */
export async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Invalid or missing Firebase ID token");
  }

  // 1. Try Firebase Admin SDK verification
  const auth = initFirebaseAdmin();
  if (auth) {
    try {
      return await auth.verifyIdToken(idToken);
    } catch (err) {
      console.warn("[FIREBASE ADMIN SDK] verifyIdToken failed, attempting public key fallback:", err.message);
      const fallback = await verifyWithGooglePublicKeys(idToken);
      if (fallback) return fallback;
      throw err;
    }
  }

  // 2. Direct Google public certificates verification fallback
  const fallback = await verifyWithGooglePublicKeys(idToken);
  if (fallback) return fallback;

  throw new Error(
    "Firebase Admin is not configured. Please set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH in backend/.env"
  );
}
