import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "./auth-middleware.js";
import { getGoogleAuthCallback, getGoogleAuthStart, getMe, postDemoAuth } from "./auth.js";
import { env } from "./env.js";
import { getResumes, postPinResume, postResumeUpload, resumeUploadMiddleware } from "./resume-vault.js";

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
app.get("/api/auth/me", requireAuth, getMe);

app.get("/api/resumes", requireAuth, getResumes);
app.post("/api/resumes/upload", requireAuth, resumeUploadMiddleware, postResumeUpload);
app.post("/api/resumes/:resumeId/pin", requireAuth, postPinResume);

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(400).json({ message: error.message });
});

app.listen(env.API_PORT, () => {
  console.log(`API running on http://localhost:${env.API_PORT}`);
});
