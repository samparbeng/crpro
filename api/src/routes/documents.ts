import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../lib/db.js";
import { requireAdmin } from "../lib/auth.js";
import { dateOnly, HttpError, money, notFound, optDate, optId, optStr, parseId, str } from "../lib/http.js";
import { invoiceTotals, itemsTotal, lineTotal, todayUtc } from "../lib/calc.js";
import { withNextNumber } from "../lib/numbering.js";

/** Purchase orders, pro-forma invoices, service records and exchange rates. */

// ---- Purchase orders -------------------------------------------------------------

export const purchaseOrdersRouter = Router();

const poInclude = {
  vendor: true,
  vehicle: { select: { id: true, regNumber: true } },
  createdBy: { select: { id: true, fullName: true } },
  items: { orderBy: { id: "asc" } },
} satisfies Prisma.PurchaseOrderInclude;

type PO = Prisma.PurchaseOrderGetPayload<{ include: typeof poInclude }>;

const presentPo = (po: PO) => ({
  ...po,
  items: po.items.map((i) => ({ ...i, total: lineTotal(i) })),
  total: itemsTotal(po.items),
});

const itemSchema = z.object({
  description: str(255),
  unit: optStr(50),
  quantity: z.coerce.number().positive().max(1e6),
  unitPrice: money,
});

const poSchema = z.object({
  orderDate: dateOnly,
  dueDate: optDate,
  vendorId: z.coerce.number().int().positive(),
  vehicleId: optId,
  status: z.enum(["PENDING", "APPROVED", "RECEIVED", "CANCELLED"]).default("PENDING"),
  notes: optStr(500),
  items: z.array(itemSchema).min(1, "Add at least one item").max(100),
});

purchaseOrdersRouter.get("/", async (req, res) => {
  const where: Prisma.PurchaseOrderWhereInput = {};
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) where.OR = [{ number: { contains: q } }, { vendor: { name: { contains: q } } }];
  const status = String(req.query.status ?? "").toUpperCase();
  if (["PENDING", "APPROVED", "RECEIVED", "CANCELLED"].includes(status)) where.status = status as PO["status"];
  const rows = await db.purchaseOrder.findMany({ where, include: poInclude, orderBy: [{ orderDate: "desc" }, { id: "desc" }] });
  res.json(rows.map(presentPo));
});

purchaseOrdersRouter.get("/:id", async (req, res) => {
  const po = await db.purchaseOrder.findUnique({ where: { id: parseId(req.params.id) }, include: poInclude });
  if (!po) throw notFound("Purchase order");
  res.json(presentPo(po));
});

purchaseOrdersRouter.post("/", async (req, res) => {
  const { items, ...data } = poSchema.parse(req.body);
  const po = await withNextNumber(
    "PO",
    (p) => db.purchaseOrder.findFirst({ where: { number: { startsWith: p } }, orderBy: { number: "desc" }, select: { number: true } }),
    (number) =>
      db.purchaseOrder.create({
        data: { ...data, number, createdById: req.user!.id, items: { create: items } },
        include: poInclude,
      }),
  );
  res.status(201).json(presentPo(po));
});

purchaseOrdersRouter.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const { items, ...data } = poSchema.parse(req.body);
  const existing = await db.purchaseOrder.findUnique({ where: { id } });
  if (!existing) throw notFound("Purchase order");
  if (existing.status === "RECEIVED" && req.user!.role !== "ADMIN") {
    throw new HttpError(403, "Only an administrator can change a received purchase order");
  }
  const po = await db.purchaseOrder.update({
    where: { id },
    data: { ...data, items: { deleteMany: {}, create: items } },
    include: poInclude,
  });
  res.json(presentPo(po));
});

purchaseOrdersRouter.delete("/:id", requireAdmin, async (req, res) => {
  await db.purchaseOrder.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
});

// ---- Pro-forma invoices ----------------------------------------------------------

export const invoicesRouter = Router();

const invoiceInclude = {
  createdBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { id: "asc" },
    include: { reservation: { select: { id: true, startDate: true, endDate: true, destination: true } } },
  },
} satisfies Prisma.InvoiceInclude;

type Inv = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const presentInvoice = (inv: Inv) => ({
  ...inv,
  items: inv.items.map((i) => ({ ...i, total: lineTotal(i) })),
  ...invoiceTotals(inv),
});

const invoiceSchema = z.object({
  invoiceDate: dateOnly,
  customerName: str(150).toUpperCase(),
  customerAddress: optStr(300),
  usdToGhs: z.coerce.number().positive().max(1e4).nullish(),
  amountPaid: money.default(0),
  notes: optStr(1000),
  items: z
    .array(
      z.object({
        description: str(255),
        quantity: z.coerce.number().positive().max(1e6),
        unitPrice: money,
        rateId: optId,
        reservationId: optId,
      }),
    )
    .min(1, "Add at least one item")
    .max(200),
});

invoicesRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rows = await db.invoice.findMany({
    where: q ? { OR: [{ number: { contains: q } }, { customerName: { contains: q } }] } : {},
    include: invoiceInclude,
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
  });
  res.json(rows.map(presentInvoice));
});

invoicesRouter.get("/:id", async (req, res) => {
  const inv = await db.invoice.findUnique({ where: { id: parseId(req.params.id) }, include: invoiceInclude });
  if (!inv) throw notFound("Invoice");
  res.json(presentInvoice(inv));
});

invoicesRouter.post("/", async (req, res) => {
  const { items, ...data } = invoiceSchema.parse(req.body);
  if (data.usdToGhs == null) {
    // Default to the most recent exchange rate on or before the invoice date.
    const rate = await db.exchangeRate.findFirst({
      where: { effectiveDate: { lte: data.invoiceDate } },
      orderBy: { effectiveDate: "desc" },
    });
    data.usdToGhs = rate ? Number(rate.usdToGhs) : null;
  }
  const inv = await withNextNumber(
    "PF",
    (p) => db.invoice.findFirst({ where: { number: { startsWith: p } }, orderBy: { number: "desc" }, select: { number: true } }),
    (number) =>
      db.invoice.create({
        data: { ...data, number, createdById: req.user!.id, items: { create: items } },
        include: invoiceInclude,
      }),
  );
  res.status(201).json(presentInvoice(inv));
});

invoicesRouter.put("/:id", async (req, res) => {
  const { items, ...data } = invoiceSchema.parse(req.body);
  const inv = await db.invoice.update({
    where: { id: parseId(req.params.id) },
    data: { ...data, items: { deleteMany: {}, create: items } },
    include: invoiceInclude,
  });
  res.json(presentInvoice(inv));
});

invoicesRouter.delete("/:id", requireAdmin, async (req, res) => {
  await db.invoice.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
});

// ---- Service records -------------------------------------------------------------

export const serviceRecordsRouter = Router();

const serviceInclude = {
  vehicle: { select: { id: true, regNumber: true, make: true, model: true } },
  driver: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, fullName: true } },
} satisfies Prisma.ServiceRecordInclude;

const serviceSchema = z.object({
  vehicleId: z.coerce.number().int().positive(),
  serviceDate: dateOnly,
  odometer: z.coerce.number().int().min(0).max(1e8).nullish(),
  garage: str(100).toUpperCase(),
  garageLocation: optStr(100),
  driverId: optId,
  details: optStr(1000),
  amount: money.default(0),
});

serviceRecordsRouter.get("/", async (req, res) => {
  const vehicleId = Number(req.query.vehicleId) || undefined;
  const rows = await db.serviceRecord.findMany({
    where: { vehicleId },
    include: serviceInclude,
    orderBy: [{ serviceDate: "desc" }, { id: "desc" }],
  });
  res.json(rows);
});

serviceRecordsRouter.get("/:id", async (req, res) => {
  const row = await db.serviceRecord.findUnique({ where: { id: parseId(req.params.id) }, include: serviceInclude });
  if (!row) throw notFound("Service record");
  res.json(row);
});

serviceRecordsRouter.post("/", async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const row = await db.serviceRecord.create({ data: { ...data, createdById: req.user!.id }, include: serviceInclude });
  res.status(201).json(row);
});

serviceRecordsRouter.put("/:id", async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const row = await db.serviceRecord.update({ where: { id: parseId(req.params.id) }, data, include: serviceInclude });
  res.json(row);
});

serviceRecordsRouter.delete("/:id", requireAdmin, async (req, res) => {
  await db.serviceRecord.delete({ where: { id: parseId(req.params.id) } });
  res.status(204).end();
});

// ---- Exchange rates --------------------------------------------------------------

export const exchangeRatesRouter = Router();

exchangeRatesRouter.get("/", async (_req, res) => {
  res.json(
    await db.exchangeRate.findMany({
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { effectiveDate: "desc" },
      take: 365,
    }),
  );
});

exchangeRatesRouter.post("/", requireAdmin, async (req, res) => {
  const { usdToGhs, effectiveDate } = z
    .object({ usdToGhs: z.coerce.number().positive().max(1e4), effectiveDate: dateOnly.optional() })
    .parse(req.body);
  const day = effectiveDate ?? todayUtc();
  const rate = await db.exchangeRate.upsert({
    where: { effectiveDate: day },
    create: { effectiveDate: day, usdToGhs, createdById: req.user!.id },
    update: { usdToGhs, createdById: req.user!.id },
  });
  res.status(201).json(rate);
});
