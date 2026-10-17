import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { RequestHandler, Response } from "express";
import type { Role } from "@prisma/client";
import { db } from "./db.js";
import { env } from "./env.js";
import { HttpError } from "./http.js";

export const COOKIE_NAME = "crpro_token";
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export type AuthUser = { id: number; username: string; fullName: string; role: Role };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/** Legacy TransPro accounts store unsalted MD5 as "md5:<hex>". */
export function isLegacyHash(hash: string): boolean {
  return hash.startsWith("md5:");
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (isLegacyHash(hash)) {
    const expected = Buffer.from(hash.slice(4).toLowerCase());
    const actual = Buffer.from(crypto.createHash("md5").update(plain).digest("hex"));
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }
  return bcrypt.compare(plain, hash);
}

export function setSessionCookie(res: Response, user: AuthUser) {
  const token = jwt.sign({ sub: String(user.id), role: user.role }, env.jwtSecret, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return next(new HttpError(401, "Not signed in"));
  let userId: number;
  try {
    const payload = jwt.verify(token, env.jwtSecret) as jwt.JwtPayload;
    userId = Number(payload.sub);
  } catch {
    return next(new HttpError(401, "Session expired, please sign in again"));
  }
  // Re-read the user each request so deactivation and role changes apply immediately.
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, fullName: true, role: true, active: true },
  });
  if (!user || !user.active) return next(new HttpError(401, "Not signed in"));
  req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== "ADMIN") return next(new HttpError(403, "Administrator access required"));
  next();
};

/** Small in-memory limiter for login attempts (per IP + username). */
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export function checkLoginRateLimit(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new HttpError(429, "Too many sign-in attempts. Try again in a few minutes.");
  }
}

export function resetLoginRateLimit(key: string) {
  attempts.delete(key);
}
