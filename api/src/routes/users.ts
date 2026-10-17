import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { hashPassword, requireAdmin } from "../lib/auth.js";
import { HttpError, notFound, optStr, parseId, str } from "../lib/http.js";

export const usersRouter = Router();
usersRouter.use(requireAdmin);

const publicFields = {
  id: true,
  username: true,
  fullName: true,
  designation: true,
  email: true,
  phone: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

const userSchema = z.object({
  username: str(50).regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
  fullName: str(100),
  designation: optStr(100),
  email: z.union([z.email(), z.literal("")]).nullish().transform((s) => s || null),
  phone: optStr(30),
  role: z.enum(["ADMIN", "STAFF"]),
  active: z.boolean().default(true),
});

const password = z.string().min(8, "Use at least 8 characters").max(200);

usersRouter.get("/", async (_req, res) => {
  res.json(await db.user.findMany({ select: publicFields, orderBy: { fullName: "asc" } }));
});

usersRouter.post("/", async (req, res) => {
  const data = userSchema.extend({ password }).parse(req.body);
  const { password: plain, ...rest } = data;
  const user = await db.user.create({
    data: { ...rest, passwordHash: await hashPassword(plain) },
    select: publicFields,
  });
  res.status(201).json(user);
});

usersRouter.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const data = userSchema.partial().extend({ password: password.optional().or(z.literal("")) }).parse(req.body);
  const { password: plain, ...rest } = data;
  if (id === req.user!.id && (rest.active === false || rest.role === "STAFF")) {
    throw new HttpError(400, "You can't deactivate or demote your own account");
  }
  const user = await db.user.update({
    where: { id },
    data: { ...rest, ...(plain ? { passwordHash: await hashPassword(plain) } : {}) },
    select: publicFields,
  });
  res.json(user);
});

usersRouter.get("/:id", async (req, res) => {
  const user = await db.user.findUnique({ where: { id: parseId(req.params.id) }, select: publicFields });
  if (!user) throw notFound("User");
  res.json(user);
});
