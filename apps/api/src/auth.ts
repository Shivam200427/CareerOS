import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { env } from "./env.js";
import type { AuthenticatedRequest } from "./auth-middleware.js";

const demoUser = {
  id: "demo-user-1",
  email: "demo@carreros.dev",
  name: "CareerOS Demo",
};

export function getGoogleAuthStart(req: Request, res: Response) {
  res.status(501).json({
    message: "Google OAuth wiring is planned in Milestone A. Use /api/auth/demo for local auth.",
  });
}

export function getGoogleAuthCallback(req: Request, res: Response) {
  res.status(501).json({
    message: "Google OAuth callback placeholder. Implementation comes with Passport strategy setup.",
  });
}

export function postDemoAuth(req: Request, res: Response) {
  const token = jwt.sign(
    {
      sub: demoUser.id,
      email: demoUser.email,
      name: demoUser.name,
    },
    env.JWT_SECRET,
    { expiresIn: "7d" },
  );

  res.json({
    token,
    user: demoUser,
  });
}

export function getMe(req: AuthenticatedRequest, res: Response) {
  res.json({
    user: req.user,
  });
}
