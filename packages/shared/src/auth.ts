import { z } from "zod";

export const authResponseSchema = z.object({
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.email(),
    name: z.string(),
  }),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
