import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const workerEnvSchema = z.object({
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

const parsed = workerEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid worker environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
