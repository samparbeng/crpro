import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import {
  checkLoginRateLimit,
  clearSessionCookie,
  hashPassword,
  isLegacyHash,
  requireAuth,
  resetLoginRateLimit,
  setSessionCookie,
  verifyPassword,
} from "../lib/auth.js";
import { HttpError } from "../lib/http.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const limitKey = `${req.ip}|${username.toLowerCase()}`;
  checkLoginRateLimit(limitKey);

  const user = await db.user.findUnique({ where: { username } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Incorrect username or password");
  }
  resetLoginRateLimit(limitKey);

  // Transparently upgrade legacy MD5 hashes to bcrypt.
  if (isLegacyHash(user.passwordHash)) {
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  }

  const authUser = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  setSessionCookie(res, authUser);
  res.json(authUser);
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(req.user);
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Use at least 8 characters").max(200),
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect");
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  res.status(204).end();
});
