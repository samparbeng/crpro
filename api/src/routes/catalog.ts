import { z } from "zod";
import { db } from "../lib/db.js";
import { crudRouter } from "../lib/crud.js";
import { money, optDate, optId, optStr, str } from "../lib/http.js";
import { rateTotals } from "../lib/calc.js";

/** Reference data and the simpler master records: categories, rates, vendors, drivers, vehicles. */

export const vehicleCategoriesRouter = crudRouter({
  model: db.vehicleCategory,
  name: "Vehicle category",
  schema: z.object({ code: str(20).toUpperCase(), name: str(100).toUpperCase() }),
  orderBy: { name: "asc" },
  adminWrites: true,
});

export const vendorCategoriesRouter = crudRouter({
  model: db.vendorCategory,
  name: "Vendor category",
  schema: z.object({ name: str(50).toUpperCase() }),
  orderBy: { name: "asc" },
  adminWrites: true,
});

export const ratesRouter = crudRouter({
  model: db.rate,
  name: "Rate",
  schema: z.object({
    code: str(20).toUpperCase(),
    category: str(50).toUpperCase(),
    description: str(255).toUpperCase(),
    vehicleUsd: money,
    levyUsd: money.default(0),
    vatUsd: money.default(0),
    getFundLevyUsd: money.default(0),
    driverAllowanceUsd: money.default(0),
    fuelUsd: money.default(0),
    active: z.boolean().default(true),
  }),
  orderBy: [{ category: "asc" }, { code: "asc" }],
  searchFields: ["code", "category", "description"],
  where: (q) => (q.active === "true" ? { active: true } : {}),
  adminWrites: true,
  present: (r) => ({ ...r, ...rateTotals(r) }),
});

export const vendorsRouter = crudRouter({
  model: db.vendor,
  name: "Vendor",
  schema: z.object({
    name: str(100).toUpperCase(),
    categoryId: optId,
    contactPerson: optStr(100),
    address: optStr(200),
    phone: optStr(50),
    paymentType: optStr(30),
    creditTermDays: z.coerce.number().int().min(0).max(365).nullish(),
  }),
  orderBy: { name: "asc" },
  include: { category: true },
  searchFields: ["name", "contactPerson", "phone"],
});

const driverInclude = { _count: { select: { reservations: true } } };

export const driversRouter = crudRouter({
  model: db.driver,
  name: "Driver",
  schema: z.object({
    firstName: str(50).toUpperCase(),
    lastName: str(50).toUpperCase(),
    phone: optStr(30),
    licenceClass: optStr(30),
    designation: optStr(50),
    inService: z.boolean().default(true),
  }),
  orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  include: driverInclude,
  searchFields: ["firstName", "lastName", "phone"],
  where: (q) => (q.inService === "true" ? { inService: true } : {}),
  present: (d) => ({ ...d, fullName: `${d.firstName} ${d.lastName}` }),
});

/** Driver trip history (legacy "driver history"). */
driversRouter.get("/:id/trips", async (req, res) => {
  const trips = await db.reservation.findMany({
    where: { driverId: Number(req.params.id) },
    include: { vehicle: { select: { regNumber: true } } },
    orderBy: { startDate: "desc" },
  });
  res.json(trips);
});

export const vehiclesRouter = crudRouter({
  model: db.vehicle,
  name: "Vehicle",
  schema: z.object({
    regNumber: str(20).toUpperCase(),
    make: str(50).toUpperCase(),
    model: str(50).toUpperCase(),
    categoryId: optId,
    year: z.coerce.number().int().min(1950).max(2100).nullish(),
    country: optStr(50),
    colour: optStr(50),
    tyreSize: optStr(50),
    chassisNumber: optStr(50),
    engineNumber: optStr(50),
    transmission: optStr(30),
    roadworthyExpiry: optDate,
    insuranceExpiry: optDate,
    nextServiceDate: optDate,
    nextServiceOdometer: z.coerce.number().int().min(0).nullish(),
    active: z.boolean().default(true),
  }),
  orderBy: { regNumber: "asc" },
  include: { category: true },
  searchFields: ["regNumber", "make", "model"],
  where: (q) => (q.active === "true" ? { active: true } : {}),
});

vehiclesRouter.get("/:id/service-records", async (req, res) => {
  const records = await db.serviceRecord.findMany({
    where: { vehicleId: Number(req.params.id) },
    include: { driver: true },
    orderBy: { serviceDate: "desc" },
  });
  res.json(records);
});
