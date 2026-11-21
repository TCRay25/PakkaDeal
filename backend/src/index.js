import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { startCronJobs } from "./services/cron.js";
import { HttpError } from "./http.js";
import authRoutes from "./routes/auth.js";
import dealRoutes from "./routes/deals.js";
import courierRoutes from "./routes/courier.js";
import disputeRoutes from "./routes/disputes.js";
import profileRoutes from "./routes/profiles.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Allow local dev, vercel previews, or configured origins
    if (!origin || config.corsOrigins.includes(origin) || origin.includes("localhost") || origin.includes("127.0.0.1")) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive for demo API access
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "2mb" }));

// Health check
app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "PakkaDeal Escrow Backend",
  timestamp: new Date().toISOString(),
}));

app.use("/auth", authRoutes);
app.use("/deals", dealRoutes);
app.use("/courier", courierRoutes);
app.use("/profiles", profileRoutes);
app.use("/admin", adminRoutes);
app.use("/notifications", notificationRoutes);
app.use("/", disputeRoutes);

// Error middleware
app.use((err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ detail: err.message });
  if (err?.name === "MulterError") return res.status(400).json({ detail: "Photo must be an image under 4 MB" });
  console.error("Unhandled Error:", err);
  res.status(500).json({ detail: err.message || "Something went wrong" });
});

await initDb();
startCronJobs();

app.listen(config.port, () => {
  console.log(`PakkaDeal Escrow API running on port :${config.port}`);
});
