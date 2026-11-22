import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

let initialized = false;

export function initFirebaseAdmin() {
  if (initialized && admin.apps.length > 0) {
    return admin;
  }

  if (admin.apps.length > 0) {
    initialized = true;
    return admin;
  }

  // 1. Direct JSON string or base64 encoded in FIREBASE_SERVICE_ACCOUNT
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      const jsonStr = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf-8");
      const serviceAccount = JSON.parse(jsonStr);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      initialized = true;
      console.log("[FIREBASE ADMIN] Initialized successfully with FIREBASE_SERVICE_ACCOUNT");
      return admin;
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
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        initialized = true;
        console.log(`[FIREBASE ADMIN] Initialized successfully with file: ${p}`);
        return admin;
      } catch (err) {
        console.warn(`[FIREBASE ADMIN WARN] Could not load service account from ${p}:`, err.message);
      }
    }
  }

  // 3. Fallback with Project ID (supports Google Application Default Credentials)
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId) {
    try {
      admin.initializeApp({ projectId });
      initialized = true;
      console.log(`[FIREBASE ADMIN] Initialized with projectId: ${projectId}`);
      return admin;
    } catch (err) {
      console.warn("[FIREBASE ADMIN WARN] Failed initializing with projectId:", err.message);
    }
  }

  return null;
}

/**
 * Verifies a Firebase Auth ID Token sent by the frontend
 * Returns the decoded token payload { uid, phone_number, email, ... }
 */
export async function verifyFirebaseIdToken(idToken) {
  const fbAdmin = initFirebaseAdmin();
  if (!fbAdmin) {
    throw new Error(
      "Firebase Admin is not configured. Please set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH in backend/.env"
    );
  }
  return await fbAdmin.auth().verifyIdToken(idToken);
}
