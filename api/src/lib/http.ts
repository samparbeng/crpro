import type { ErrorRequestHandler, RequestHandler } from "express";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Record") => new HttpError(404, `${what} not found`);

export function parseId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
}

// ---- Reusable Zod field builders -------------------------------------------------

/** Required trimmed string. */
export const str = (max: number) => z.string().trim().min(1, "Required").max(max);

/** Optional string: empty / missing → null. */
export const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);

/** Required YYYY-MM-DD date. */
export const dateOnly = z.iso.date().transform((s) => new Date(s));

/** Optional YYYY-MM-DD date: empty / missing → null. */
export const optDate = z
  .union([z.iso.date(), z.literal("")])
  .nullish()
  .transform((s) => (s ? new Date(s) : null));

export const optId = z.coerce.number().int().positive().nullish().or(z.literal("").transform(() => null));

export const money = z.coerce.number().min(0).max(1e10);

// ---- Middleware ------------------------------------------------------------------

/**
 * Mutating requests must be JSON. Browsers can't send cross-site JSON without a CORS
 * preflight (which we never approve), so together with SameSite cookies this blocks CSRF.
 */
export const requireJson: RequestHandler = (req, _res, next) => {
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const hasBody = Number(req.headers["content-length"] ?? 0) > 0 || req.headers["transfer-encoding"];
  if (mutating && hasBody && !req.is("application/json")) {
    return next(new HttpError(415, "Content-Type must be application/json"));
  }
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const target = (err.meta?.target as string[] | string | undefined) ?? "value";
      return res.status(409).json({ error: `A record with this ${String(target)} already exists` });
    }
    if (err.code === "P2003") {
      return res.status(409).json({ error: "This record is in use and can't be removed" });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found" });
    }
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
