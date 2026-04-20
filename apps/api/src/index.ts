import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { getGoogleAuthCallback, getGoogleAuthStart, getMe, postDemoAuth } from "./auth.js";
import { env } from "./env.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.get("/api/auth/google", getGoogleAuthStart);
app.get("/api/auth/google/callback", getGoogleAuthCallback);
app.post("/api/auth/demo", postDemoAuth);
app.get("/api/auth/me", getMe);

app.listen(env.API_PORT, () => {
  console.log(`API running on http://localhost:${env.API_PORT}`);
});
