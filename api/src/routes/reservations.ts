import { Router } from "express";
import { z } from "zod";
import type { Prisma, Reservation, ReservationStatus } from "@prisma/client";
import { db } from "../lib/db.js";
import { dateOnly, HttpError, notFound, optId, optStr, parseId, str } from "../lib/http.js";
import { rateTotals, reservationDays } from "../lib/calc.js";

export const reservationsRouter = Router();

const include = {
  vehicleCategory: true,
  driver: true,
  vehicle: { select: { id: true, regNumber: true, make: true, model: true } },
  rate: true,
  createdBy: { select: { id: true, fullName: true, username: true } },
} satisfies Prisma.ReservationInclude;

type ReservationWithRelations = Prisma.ReservationGetPayload<{ include: typeof include }>;

function present(r: ReservationWithRelations) {
  const days = reservationDays(r.startDate, r.endDate);
  const dailyUsd = r.rate ? rateTotals(r.rate).totalUsd : null;
  return {
    ...r,
    days,
    estimatedTotalUsd: dailyUsd == null ? null : Math.round(dailyUsd * days * 100) / 100,
    driverName: r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : r.externalDriver,
    vehicleReg: r.vehicle?.regNumber ?? r.externalVehicle,
  };
}

const STATUSES = ["PENDING", "IN_PROGRESS", "CLOSED", "CANCELLED"] as const;

const detailsSchema = z
  .object({
    companyName: str(100).toUpperCase(),
    contactName: str(100).toUpperCase(),
    contactPhone: str(30),
    vehicleCategoryId: optId,
    startDate: dateOnly,
    endDate: dateOnly,
    destination: str(100).toUpperCase(),
    remarks: optStr(500),
  })
  .refine((r) => r.endDate >= r.startDate, { message: "End date can't be before start date", path: ["endDate"] });

async function load(id: number) {
  const r = await db.reservation.findUnique({ where: { id }, include });
  if (!r) throw notFound("Reservation");
  return r;
}

function assertStatus(r: Reservation, allowed: ReservationStatus[], action: string) {
  if (!allowed.includes(r.status)) {
    throw new HttpError(409, `Can't ${action} a reservation that is ${r.status.replace("_", " ").toLowerCase()}`);
  }
}

reservationsRouter.get("/", async (req, res) => {
  const where: Prisma.ReservationWhereInput = {};
  const status = String(req.query.status ?? "").toUpperCase();
  if ((STATUSES as readonly string[]).includes(status)) where.status = status as ReservationStatus;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q) {
    where.OR = [
      { companyName: { contains: q } },
      { contactName: { contains: q } },
      { destination: { contains: q } },
      ...(Number.isInteger(Number(q)) ? [{ id: Number(q) }] : []),
    ];
  }
  const rows = await db.reservation.findMany({
    where,
    include,
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: Math.min(Number(req.query.limit) || 500, 2000),
  });
  res.json(rows.map(present));
});

/** Distinct company names, for autocompleting the booking form. */
reservationsRouter.get("/companies", async (_req, res) => {
  const rows = await db.reservation.findMany({
    distinct: ["companyName"],
    select: { companyName: true, contactName: true, contactPhone: true },
    orderBy: { id: "desc" },
    take: 1000,
  });
  res.json(rows);
});

reservationsRouter.get("/:id", async (req, res) => {
  res.json(present(await load(parseId(req.params.id))));
});

reservationsRouter.post("/", async (req, res) => {
  const data = detailsSchema.parse(req.body);
  const r = await db.reservation.create({ data: { ...data, createdById: req.user!.id }, include });
  res.status(201).json(present(r));
});

reservationsRouter.put("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  assertStatus(await load(id), ["PENDING", "IN_PROGRESS"], "edit");
  const data = detailsSchema.parse(req.body);
  const r = await db.reservation.update({ where: { id }, data, include });
  res.json(present(r));
});

/** Copy a reservation's booking details into a new pending reservation. */
reservationsRouter.post("/:id/duplicate", async (req, res) => {
  const src = await load(parseId(req.params.id));
  const overrides = z
    .object({ startDate: dateOnly.optional(), endDate: dateOnly.optional() })
    .parse(req.body ?? {});
  const startDate = overrides.startDate ?? src.startDate;
  const endDate = overrides.endDate ?? src.endDate;
  if (endDate < startDate) throw new HttpError(400, "End date can't be before start date");
  const r = await db.reservation.create({
    data: {
      companyName: src.companyName,
      contactName: src.contactName,
      contactPhone: src.contactPhone,
      vehicleCategoryId: src.vehicleCategoryId,
      destination: src.destination,
      remarks: src.remarks,
      startDate,
      endDate,
      createdById: req.user!.id,
    },
    include,
  });
  res.status(201).json(present(r));
});

const assignSchema = z.object({
  source: z.enum(["IN_HOUSE", "THIRD_PARTY"]).nullish(),
  driverId: optId,
  vehicleId: optId,
  externalDriver: optStr(100),
  externalVehicle: optStr(50),
  rateId: optId,
});

/** Find other live reservations that overlap this one's dates and use the same driver or vehicle. */
async function findClashes(r: Reservation, driverId: number | null, vehicleId: number | null) {
  if (!driverId && !vehicleId) return [];
  return db.reservation.findMany({
    where: {
      id: { not: r.id },
      status: { in: ["PENDING", "IN_PROGRESS"] },
      startDate: { lte: r.endDate },
      endDate: { gte: r.startDate },
      OR: [...(driverId ? [{ driverId }] : []), ...(vehicleId ? [{ vehicleId }] : [])],
    },
    select: { id: true, driverId: true, vehicleId: true, companyName: true },
  });
}

reservationsRouter.post("/:id/assign", async (req, res) => {
  const id = parseId(req.params.id);
  const current = await load(id);
  assertStatus(current, ["PENDING", "IN_PROGRESS"], "change assignments on");
  const input = assignSchema.parse(req.body);

  const source = input.source === undefined ? current.source : input.source;
  // In-house jobs use our own drivers/vehicles; third-party jobs record free-text details.
  const data: Prisma.ReservationUncheckedUpdateInput = {
    source,
    rateId: input.rateId === undefined ? current.rateId : input.rateId,
    driverId: source === "IN_HOUSE" ? (input.driverId === undefined ? current.driverId : input.driverId) : null,
    vehicleId: source === "IN_HOUSE" ? (input.vehicleId === undefined ? current.vehicleId : input.vehicleId) : null,
    externalDriver:
      source === "THIRD_PARTY"
        ? input.externalDriver === undefined
          ? current.externalDriver
          : input.externalDriver
        : null,
    externalVehicle:
      source === "THIRD_PARTY"
        ? input.externalVehicle === undefined
          ? current.externalVehicle
          : input.externalVehicle
        : null,
  };

  const driverId = (data.driverId as number | null) ?? null;
  const vehicleId = (data.vehicleId as number | null) ?? null;
  if (driverId) {
    const driver = await db.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new HttpError(400, "Driver not found");
    if (!driver.inService) throw new HttpError(409, "That driver is not in service");
  }
  if (vehicleId) {
    const vehicle = await db.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new HttpError(400, "Vehicle not found");
    if (!vehicle.active) throw new HttpError(409, "That vehicle is not active");
  }
  if (data.rateId) {
    const rate = await db.rate.findUnique({ where: { id: data.rateId as number } });
    if (!rate) throw new HttpError(400, "Rate not found");
  }

  const clashes = await findClashes(current, driverId, vehicleId);
  if (clashes.length) {
    const c = clashes[0];
    const what = c.driverId === driverId && driverId ? "driver" : "vehicle";
    throw new HttpError(409, `That ${what} is already booked on reservation #${c.id} (${c.companyName}) for overlapping dates`);
  }

  const r = await db.reservation.update({ where: { id }, data, include });
  res.json(present(r));
});

function missingForStart(r: Reservation): string[] {
  const missing: string[] = [];
  if (!r.source) missing.push("source");
  if (r.source === "IN_HOUSE") {
    if (!r.driverId) missing.push("driver");
    if (!r.vehicleId) missing.push("vehicle");
  }
  if (r.source === "THIRD_PARTY") {
    if (!r.externalDriver) missing.push("driver");
    if (!r.externalVehicle) missing.push("vehicle");
  }
  if (!r.rateId) missing.push("rate code");
  return missing;
}

const transitions: Record<string, { from: ReservationStatus[]; to: ReservationStatus; verb: string }> = {
  start: { from: ["PENDING"], to: "IN_PROGRESS", verb: "start" },
  close: { from: ["IN_PROGRESS"], to: "CLOSED", verb: "close" },
  cancel: { from: ["PENDING", "IN_PROGRESS"], to: "CANCELLED", verb: "cancel" },
  reopen: { from: ["CANCELLED"], to: "PENDING", verb: "reopen" },
};

reservationsRouter.post("/:id/:action", async (req, res) => {
  const t = transitions[req.params.action];
  if (!t) throw notFound("Action");
  const id = parseId(req.params.id);
  const current = await load(id);
  assertStatus(current, t.from, t.verb);
  if (req.params.action === "start") {
    const missing = missingForStart(current);
    if (missing.length) {
      const list = new Intl.ListFormat("en", { type: "conjunction" }).format(missing.map((m) => `a ${m}`));
      throw new HttpError(409, `Assign ${list} before starting`);
    }
  }
  if (req.params.action === "reopen" && (await findClashes(current, current.driverId, current.vehicleId)).length) {
    throw new HttpError(409, "Its driver or vehicle has since been booked for these dates. Duplicate it instead.");
  }
  const r = await db.reservation.update({ where: { id }, data: { status: t.to }, include });
  res.json(present(r));
});
