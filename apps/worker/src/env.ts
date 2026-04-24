import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const workerEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");

dotenv.config({ path: workerEnvPath });

const workerEnvSchema = z.object({
  REDIS_URL: z.url().default("redis://localhost:6379"),
  JOB_QUEUE_NAME: z.string().default("job-apply-queue"),
  JOB_DB_FILE: z.string().default("data/jobs/store.json"),
  PLAYWRIGHT_ENABLED: z.coerce.boolean().default(false),
  AGENT_ARTIFACTS_DIR: z.string().default("data/agent-runs"),
});

const parsed = workerEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid worker environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
