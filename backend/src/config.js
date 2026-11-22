import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 8000),
  databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/pakkadeal",
  useSqlite: process.env.USE_SQLITE === "true",
  secretKey: process.env.SECRET_KEY || "pakkadeal-super-secret-key-prod-2026",
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((s) => s.trim()),
  demoOtp: process.env.DEMO_OTP || "123456",
  adminPhones: (process.env.ADMIN_PHONES || "01700000000").split(",").map((s) => s.trim()),
  webhookKey: process.env.WEBHOOK_KEY || "demo-webhook-key",
  shipWithinHours: Number(process.env.SHIP_WITHIN_HOURS || 48),
  confirmWithinHours: Number(process.env.CONFIRM_WITHIN_HOURS || 72),
  feePercent: Number(process.env.FEE_PERCENT || 1),
  feeMin: Number(process.env.FEE_MIN || 10),
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.0-flash",
};
