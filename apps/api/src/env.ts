import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16),
  FRONTEND_URL: z.url().default("http://localhost:5173"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

const parsed = apiEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid API environment variables", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
