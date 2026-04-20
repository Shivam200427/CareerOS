import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing bearer token" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;

    req.user = {
      id: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };

    if (!req.user.id || !req.user.email) {
      res.status(401).json({ message: "Invalid auth payload" });
      return;
    }

    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}
