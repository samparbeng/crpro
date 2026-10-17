import { Router, type RequestHandler } from "express";
import type { z } from "zod";
import { notFound, parseId } from "./http.js";
import { requireAdmin } from "./auth.js";

/** The subset of a Prisma model delegate that the CRUD helper uses. */
type Delegate = {
  findMany(args: object): Promise<unknown[]>;
  findUnique(args: object): Promise<unknown | null>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
};

type CrudOptions = {
  model: unknown;
  name: string;
  schema: z.ZodObject;
  orderBy: object;
  include?: object;
  /** Fields matched by the ?q= search box. */
  searchFields?: string[];
  /** Extra filters derived from the query string. */
  where?: (query: Record<string, unknown>) => object;
  /** Only admins may create / update / delete. */
  adminWrites?: boolean;
  /** Add computed fields to each record before it's returned. */
  present?: (record: any) => unknown;
};

export function crudRouter(opts: CrudOptions) {
  const model = opts.model as Delegate;
  const router = Router();
  const guard: RequestHandler[] = opts.adminWrites ? [requireAdmin] : [];
  const present = opts.present ?? ((r: unknown) => r);

  router.get("/", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Record<string, unknown> = { ...(opts.where?.(req.query) ?? {}) };
    if (q && opts.searchFields?.length) {
      where.OR = opts.searchFields.map((f) => ({ [f]: { contains: q } }));
    }
    const rows = await model.findMany({ where, orderBy: opts.orderBy, include: opts.include });
    res.json(rows.map(present));
  });

  router.get("/:id", async (req, res) => {
    const row = await model.findUnique({ where: { id: parseId(req.params.id) }, include: opts.include });
    if (!row) throw notFound(opts.name);
    res.json(present(row));
  });

  router.post("/", ...guard, async (req, res) => {
    const data = opts.schema.parse(req.body);
    const row = await model.create({ data, include: opts.include });
    res.status(201).json(present(row));
  });

  router.put("/:id", ...guard, async (req, res) => {
    const data = opts.schema.partial().parse(req.body);
    const row = await model.update({ where: { id: parseId(req.params.id) }, data, include: opts.include });
    res.json(present(row));
  });

  router.delete("/:id", ...guard, async (req, res) => {
    await model.delete({ where: { id: parseId(req.params.id) } });
    res.status(204).end();
  });

  return router;
}
