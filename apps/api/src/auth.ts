import jwt from "jsonwebtoken";
import type { Request, Response } from "express";
import { env } from "./env.js";

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

export function getMe(req: Request, res: Response) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const token = auth.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    res.json({ payload });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}
