import { z } from "zod";

export const apiEnvSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  JWT_SECRET: z.string().min(16),
  FRONTEND_URL: z.url().default("http://localhost:5173"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const workerEnvSchema = z.object({
  REDIS_URL: z.url().default("redis://localhost:6379"),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
