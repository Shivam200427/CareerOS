import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const apiEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");

dotenv.config({ path: apiEnvPath });

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16),
  FRONTEND_URL: z.url().default("http://localhost:5173"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  JOB_QUEUE_NAME: z.string().default("job-apply-queue"),
  JOB_DB_FILE: z.string().default("data/jobs/store.json"),
  RESUME_STORAGE_DIR: z.string().default("data/resumes/files"),
  RESUME_DB_FILE: z.string().default("data/resumes/store.json"),
});

const parsed = apiEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid API environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
