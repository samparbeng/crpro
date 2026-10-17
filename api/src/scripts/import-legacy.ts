/**
 * One-off import of a TransPro (legacy PHP) database into crpro.
 *
 *   LEGACY_DATABASE_URL=mysql://root@host:3306/carrental npm run import:legacy
 *
 * Run it against a freshly migrated crpro database seeded with SEED_DEMO_DATA=false.
 * Reservation numbers are preserved. Legacy MD5 passwords keep working and are
 * upgraded to bcrypt the first time each user signs in.
 */
import mysql from "mysql2/promise";
import type { ReservationStatus, Role } from "@prisma/client";
import { db } from "../lib/db.js";

type Row = Record<string, any>;

const legacyUrl = process.env.LEGACY_DATABASE_URL;
if (!legacyUrl) {
  console.error("Set LEGACY_DATABASE_URL, e.g. mysql://root@localhost:3306/carrental");
  process.exit(1);
}

const clean = (v: unknown, max = 255): string | null => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
};
const upper = (v: unknown, max = 255) => clean(v, max)?.toUpperCase() ?? null;
/** Legacy DATE/DATETIME string → UTC date, ignoring MySQL zero dates. */
const day = (v: unknown): Date | null => {
  const s = clean(v);
  if (!s || s.startsWith("0000")) return null;
  const d = new Date(s.slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Legacy "YYYY-MM-DD HH:MM:SS" (stored as UTC) → Date. */
const timestamp = (v: unknown): Date | null => {
  const s = clean(v);
  if (!s || s.startsWith("0000")) return null;
  const d = new Date(`${s.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const key = (v: unknown) => (clean(v) ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function main() {
  const legacy = await mysql.createConnection({ uri: legacyUrl, dateStrings: true });
  const q = async (sql: string) => (await legacy.query(sql))[0] as Row[];

  if ((await db.reservation.count()) > 0 || (await db.vehicle.count()) > 0) {
    throw new Error("Target database already has reservations or vehicles. Import into a fresh database.");
  }

  // ---- Users -----------------------------------------------------------------
  const existingUsers = new Set((await db.user.findMany({ select: { username: true } })).map((u) => u.username.toUpperCase()));
  let users = 0;
  for (const u of await q("SELECT * FROM administrator ORDER BY id")) {
    const username = clean(u.UserName, 50);
    if (!username || existingUsers.has(username.toUpperCase())) continue;
    existingUsers.add(username.toUpperCase());
    const designation = clean(u.UserDesignation, 100);
    const role: Role = /admin|ceo/i.test(designation ?? "") ? "ADMIN" : "STAFF";
    await db.user.create({
      data: {
        username,
        fullName: upper(u.UserFullName, 100) ?? username,
        designation,
        email: clean(u.UserEmail, 100),
        phone: clean(u.Mobile, 30),
        role,
        passwordHash: `md5:${String(u.Password).trim().toLowerCase()}`,
      },
    });
    users++;
  }
  const userByName = new Map((await db.user.findMany()).map((u) => [u.username.toUpperCase(), u.id]));

  // ---- Reference data --------------------------------------------------------
  await db.vehicleCategory.createMany({
    data: (await q("SELECT category, descri FROM vehcat"))
      .filter((c) => clean(c.category))
      .map((c) => ({ code: upper(c.category, 20)!, name: upper(c.descri, 100) ?? upper(c.category, 100)! })),
    skipDuplicates: true,
  });
  const categories = await db.vehicleCategory.findMany();
  const matchCategory = (v: unknown): number | null => {
    const k = key(v);
    if (!k) return null;
    const exact = categories.find((c) => key(c.code) === k || key(c.name) === k);
    if (exact) return exact.id;
    const partial = categories.find((c) => k.includes(key(c.name)) || key(c.name).includes(k));
    return partial?.id ?? null;
  };

  await db.vendorCategory.createMany({
    data: (await q("SELECT DISTINCT VENDORCAT FROM vendor WHERE VENDORCAT IS NOT NULL")).map((c) => ({ name: upper(c.VENDORCAT, 50)! })),
    skipDuplicates: true,
  });
  const vendorCats = new Map((await db.vendorCategory.findMany()).map((c) => [c.name, c.id]));

  await db.rate.createMany({
    data: (await q("SELECT * FROM vehiclerate"))
      .filter((r) => clean(r.ratecode))
      .map((r) => ({
        code: upper(r.ratecode, 20)!,
        category: upper(r.category, 50) ?? "GENERAL",
        description: upper(r.narrate, 255) ?? upper(r.ratecode)!,
        vehicleUsd: Number(r.vehusd ?? 0),
        levyUsd: Number(r.levyusd ?? 0),
        vatUsd: Number(Number(r.vatusd ?? 0).toFixed(3)),
        getFundLevyUsd: Number(r.gtlevyusd ?? 0),
        driverAllowanceUsd: Number(r.drallowance ?? 0),
        fuelUsd: Number(r.fuelusd ?? 0),
      })),
    skipDuplicates: true,
  });
  const rateByCode = new Map((await db.rate.findMany()).map((r) => [key(r.code), r.id]));

  // ---- Vendors ---------------------------------------------------------------
  for (const v of await q("SELECT * FROM vendor ORDER BY id")) {
    const name = upper(v.VENDORNAME, 100);
    if (!name) continue;
    await db.vendor.upsert({
      where: { name },
      update: {},
      create: {
        name,
        categoryId: vendorCats.get(upper(v.VENDORCAT, 50) ?? "") ?? null,
        contactPerson: upper(v.CONTACTPERSON, 100),
        address: upper(v.VENDORADDRESS, 200),
        phone: clean(v.TELLNUM, 50),
        paymentType: upper(v.PAYTYPE, 30),
        creditTermDays: v.CREDITTERM == null ? null : Number(v.CREDITTERM),
      },
    });
  }
  const vendorByName = new Map((await db.vendor.findMany()).map((v) => [key(v.name), v.id]));
  async function vendorId(name: unknown): Promise<number> {
    const k = key(name) || "UNKNOWNVENDOR";
    const found = vendorByName.get(k);
    if (found) return found;
    const v = await db.vendor.create({ data: { name: upper(name, 100) ?? "UNKNOWN VENDOR" } });
    vendorByName.set(k, v.id);
    return v.id;
  }

  // ---- Drivers ---------------------------------------------------------------
  const driverByName = new Map<string, number>();
  for (const d of await q("SELECT * FROM drivers ORDER BY id")) {
    const full = upper(d.FULLNAME, 100) ?? "";
    const parts = full.split(" ");
    const firstName = upper(d.FIRSTNAME, 50) ?? parts[0] ?? "UNKNOWN";
    const lastName = upper(d.LASTNAME, 50) ?? (parts.slice(1).join(" ") || "-");
    const driver = await db.driver.create({
      data: {
        firstName,
        lastName,
        phone: clean(d.CONTACTNO, 30),
        licenceClass: upper(d.CAT, 30),
        designation: upper(d.DESIG, 50),
        inService: Number(d.INSERV) === 1,
      },
    });
    driverByName.set(key(full || `${firstName} ${lastName}`), driver.id);
    driverByName.set(key(`${firstName} ${lastName}`), driver.id);
  }

  // ---- Vehicles (fleetmain is the master list; `vehicle` fills gaps) ---------
  const vehicleByReg = new Map<string, number>();
  for (const v of await q("SELECT * FROM fleetmain")) {
    const regNumber = upper(v.REGNUMBER, 20);
    if (!regNumber || vehicleByReg.has(key(regNumber))) continue;
    const vehicle = await db.vehicle.create({
      data: {
        regNumber,
        make: upper(v.MAKE, 50) ?? "UNKNOWN",
        model: upper(v.MODEL, 50) ?? "UNKNOWN",
        categoryId: matchCategory(v.CATEGORY),
        year: v.YOM ? Number(v.YOM) : null,
        country: upper(v.COUNTRY, 50),
        colour: upper(v.PAINTCOL, 50),
        tyreSize: upper(v.TYRESIZE, 50),
        chassisNumber: upper(v.CHASSIS, 50),
        engineNumber: upper(v.ENGINENUMBER, 50),
        transmission: upper(v.TRANSMISSIONTYPE, 30),
        roadworthyExpiry: day(v.ROADWORTHY),
        insuranceExpiry: day(v.INSURANCE),
        nextServiceDate: day(v.NEXTSERVICEDATE),
        nextServiceOdometer: Number(v.NEXTSERVICEODO) || null,
      },
    });
    vehicleByReg.set(key(regNumber), vehicle.id);
  }
  for (const v of await q("SELECT * FROM vehicle")) {
    const regNumber = upper(v.REGNUMBER, 20);
    if (!regNumber || vehicleByReg.has(key(regNumber))) continue;
    const vehicle = await db.vehicle.create({
      data: {
        regNumber,
        make: upper(v.MAKE, 50) ?? "UNKNOWN",
        model: upper(v.MODEL, 50) ?? "UNKNOWN",
        categoryId: matchCategory(v.CATEGORY),
        year: v.YROFPURC ? Number(v.YROFPURC) : null,
      },
    });
    vehicleByReg.set(key(regNumber), vehicle.id);
  }

  // ---- Reservations (ids preserved) ------------------------------------------
  const statusMap: Record<string, ReservationStatus> = {
    PENDING: "PENDING",
    INPROGRESS: "IN_PROGRESS",
    CLOSED: "CLOSED",
    CANCELLED: "CANCELLED",
  };
  const legacyReservations = await q("SELECT * FROM reservations ORDER BY MYPR");
  const batch = [];
  for (const r of legacyReservations) {
    const created = day(r.SYDATE) ?? new Date("2019-01-01");
    const startDate = day(r.ASHASE) ?? created;
    let endDate = day(r.AWIE) ?? startDate;
    if (endDate < startDate) endDate = startDate;

    const thirdParty = key(r.RERESOURCE) === "TP";
    const driverText = upper(r.ASSIGNEDDRIVER, 100);
    const vehicleText = upper(r.ASSIGNEDVEHICLE, 50);
    const driverId = !thirdParty && driverText ? (driverByName.get(key(driverText)) ?? null) : null;
    const vehicleId = !thirdParty && vehicleText ? (vehicleByReg.get(key(vehicleText)) ?? null) : null;
    // Anything we can't link to a known driver/vehicle is kept as free text under THIRD_PARTY.
    const external = thirdParty || (driverText && !driverId) || (vehicleText && !vehicleId);
    const hasAssignment = driverText || vehicleText;

    const tripCode = clean(r.TRIPCODE, 50);
    const rateId = tripCode ? (rateByCode.get(key(tripCode)) ?? null) : null;
    const categoryId = matchCategory(r.VTYPE);
    const notes = [
      clean(r.REMARKS, 400),
      !categoryId && clean(r.VTYPE) ? `Requested: ${clean(r.VTYPE)}` : null,
      tripCode && !rateId ? `Legacy trip code: ${tripCode}` : null,
    ].filter(Boolean);

    batch.push({
      id: Number(r.MYPR),
      companyName: upper(r.COMPNAME, 100) ?? "UNKNOWN",
      contactName: upper(r.CONTACTPER, 100) ?? upper(r.COMPNAME, 100) ?? "UNKNOWN",
      contactPhone: clean(r.PHONENUM, 30) ?? "-",
      vehicleCategoryId: categoryId,
      startDate,
      endDate,
      destination: upper(r.DESTINATION, 100) ?? "-",
      remarks: notes.length ? notes.join(" | ").slice(0, 500) : null,
      status: statusMap[key(r.CONFIRM)] ?? "PENDING",
      source: hasAssignment || thirdParty ? (external ? ("THIRD_PARTY" as const) : ("IN_HOUSE" as const)) : null,
      driverId: external ? null : driverId,
      vehicleId: external ? null : vehicleId,
      externalDriver: external ? driverText : null,
      externalVehicle: external ? vehicleText : null,
      rateId,
      createdById: userByName.get((clean(r.USER) ?? "").toUpperCase()) ?? null,
      createdAt: timestamp(r.SYDATE) ?? created,
    });
  }
  for (let i = 0; i < batch.length; i += 500) {
    await db.reservation.createMany({ data: batch.slice(i, i + 500) });
  }

  // ---- Service records -------------------------------------------------------
  let services = 0;
  for (const s of await q("SELECT * FROM servicerecords ORDER BY id")) {
    const reg = upper(s.SERVICEVEHICLE, 20);
    if (!reg) continue;
    let vehicleId = vehicleByReg.get(key(reg));
    if (!vehicleId) {
      vehicleId = (await db.vehicle.create({ data: { regNumber: reg, make: "UNKNOWN", model: "UNKNOWN", active: false } })).id;
      vehicleByReg.set(key(reg), vehicleId);
    }
    await db.serviceRecord.create({
      data: {
        vehicleId,
        serviceDate: day(s.SERVICEDATE) ?? day(s.SYDATE) ?? new Date("2019-01-01"),
        odometer: Number(String(s.SERVICEODO ?? "").replace(/\D/g, "")) || null,
        garage: upper(s.SERVICEGARAGE, 100) ?? "UNKNOWN",
        garageLocation: upper(s.GLOCATION, 100),
        driverId: driverByName.get(key(s.SERVICEDRIVER)) ?? null,
        details: clean(s.SERVICEDETAIL, 1000),
        amount: Number(s.AMOUNTSPENT ?? 0),
        createdById: userByName.get((clean(s.SERVICEUSER) ?? "").toUpperCase()) ?? null,
      },
    });
    services++;
  }

  // ---- Purchase orders -------------------------------------------------------
  const usedNumbers = new Set<string>();
  let pos = 0;
  for (const p of await q("SELECT * FROM po ORDER BY SysDate, PONumber")) {
    let number = clean(p.PONumber, 18) ?? `LEGACY${pos + 1}`;
    for (let n = 2; usedNumbers.has(number); n++) number = `${clean(p.PONumber, 15)}-${n}`;
    usedNumbers.add(number);
    const reg = upper(p.Vehicle, 20);
    await db.purchaseOrder.create({
      data: {
        number,
        orderDate: day(p.PODate) ?? day(p.SysDate) ?? new Date("2017-01-01"),
        dueDate: day(p.DueDate),
        vendorId: await vendorId(p.VendorName),
        vehicleId: reg ? (vehicleByReg.get(key(reg)) ?? null) : null,
        status: /canc/i.test(p.Status ?? "") ? "CANCELLED" : "APPROVED",
        notes: clean(p.VIN) ? `Legacy ref: ${clean(p.VIN)}` : null,
        createdById: userByName.get((clean(p.POUser) ?? "").toUpperCase()) ?? null,
        items: {
          create: [
            {
              description: clean(p.PODescription, 255) ?? "-",
              unit: upper(p.POUnit, 50),
              quantity: Number(p.POQty) || 1,
              unitPrice: Number(p.POUP ?? 0),
            },
          ],
        },
      },
    });
    pos++;
  }

  // ---- Exchange rates --------------------------------------------------------
  let rates = 0;
  for (const e of await q("SELECT * FROM exchangerate ORDER BY id")) {
    const effectiveDate = day(e.ratedate);
    if (!effectiveDate || !e.dollartocedi) continue;
    await db.exchangeRate.upsert({
      where: { effectiveDate },
      create: { effectiveDate, usdToGhs: Number(e.dollartocedi), createdById: userByName.get((clean(e.user) ?? "").toUpperCase()) ?? null },
      update: { usdToGhs: Number(e.dollartocedi) },
    });
    rates++;
  }

  await legacy.end();
  console.log(
    `Imported ${users} users, ${await db.vehicle.count()} vehicles, ${await db.driver.count()} drivers, ` +
      `${await db.vendor.count()} vendors, ${batch.length} reservations, ${services} service records, ${pos} purchase orders, ${rates} exchange rates.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
