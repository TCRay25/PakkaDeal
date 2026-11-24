import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export function validateSecretKey(key, name) {
  if (!key || typeof key !== "string" || key.trim().length < 32) {
    throw new Error(`${name} is missing or shorter than 32 characters (no fallback allowed)`);
  }
  return key.trim();
}

const secretKey = validateSecretKey(process.env.SECRET_KEY, "SECRET_KEY");
const webhookKey = validateSecretKey(process.env.WEBHOOK_KEY, "WEBHOOK_KEY");

export const config = {
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/pakkadeal",
  useSqlite: process.env.USE_SQLITE === "true",
  secretKey,
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((s) => s.trim()),
  demoOtp: process.env.DEMO_OTP || "123456",
  demoPhones: (process.env.DEMO_PHONES || "01700000000,01711223344,01755667788,01811223344,01911223344,01710112233").split(",").map((s) => s.trim()),
  adminPhones: (process.env.ADMIN_PHONES || "01700000000").split(",").map((s) => s.trim()),
  webhookKey,
  shipWithinHours: Number(process.env.SHIP_WITHIN_HOURS || 48),
  confirmWithinHours: Number(process.env.CONFIRM_WITHIN_HOURS || 72),
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
};

export function isDemoPhone(phone) {
  const p = (phone || "").replace(/\D/g, "").slice(-11);
  return config.demoPhones.includes(p) || config.adminPhones.includes(p);
}
