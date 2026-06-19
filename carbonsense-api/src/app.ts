import "./types/express";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { supabaseAdmin } from "./config/supabase";
import { errorHandler } from "./middleware/errorHandler";
import { defaultRateLimit } from "./middleware/rateLimit";
import { adminRoutes } from "./routes/admin.routes";
import { authRoutes } from "./routes/auth.routes";
import { carbonRoutes } from "./routes/carbon.routes";
import { challengesRoutes } from "./routes/challenges.routes";
import { copilotRoutes } from "./routes/copilot.routes";
import { impactRoutes } from "./routes/impact.routes";
import { levelsRoutes } from "./routes/levels.routes";
import { onboardingRoutes } from "./routes/onboarding.routes";
import { plaidRoutes } from "./routes/plaid.routes";
import { profileRoutes } from "./routes/profile.routes";
import {
  achievementsRoutes,
  levelRoutes,
  streakRoutes
} from "./routes/streaks.routes";
import { teamsRoutes } from "./routes/teams.routes";

export const app = express();
app.disable("etag");

const explicitAllowedOrigins = new Set(
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    env.FRONTEND_URL
  ].filter(Boolean)
);

function isAllowedDevOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || explicitAllowedOrigins.has(origin) || isAllowedDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Cache-Control",
      "cache-control",
      "Pragma",
      "pragma",
      "Accept",
      "Origin"
    ]
  })
);
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/health", async (_req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from("users")
      .select("id", { count: "exact", head: true });

    res.status(200).json({
      status: "ok",
      version: "1.0.0",
      db: error ? "error" : "connected",
      timestamp: new Date().toISOString()
    });
  } catch {
    res.status(500).json({
      status: "error",
      db: "error",
      timestamp: new Date().toISOString()
    });
  }
});

app.use("/api", defaultRateLimit);

app.use("/api/admin", adminRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/plaid", plaidRoutes);
app.use("/api/carbon", carbonRoutes);
app.use("/api/challenges", challengesRoutes);
app.use("/api/streaks", streakRoutes);
app.use("/api/achievements", achievementsRoutes);
app.use("/api/level", levelRoutes);
app.use("/api/levels", levelsRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/copilot", copilotRoutes);
app.use("/api/impact", impactRoutes);
app.use("/api/profile", profileRoutes);

app.use(errorHandler);
