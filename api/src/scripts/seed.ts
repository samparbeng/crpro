/**
 * Seeds an empty database with reference data and FAKE demo records.
 * Safe to run repeatedly: does nothing if any user already exists.
 *
 *   SEED_ADMIN_PASSWORD=...   password for the "admin" account (random if unset)
 *   SEED_DEMO_DATA=false      reference data + admin only, no demo records
 */
import crypto from "node:crypto";
import { db } from "../lib/db.js";
import { hashPassword } from "../lib/auth.js";
import { addDays, todayUtc } from "../lib/calc.js";

// Deterministic PRNG so the demo data is the same on every machine.
let seedState = 42;
function rand() {
  seedState = (seedState * 1664525 + 1013904223) % 2 ** 32;
  return seedState / 2 ** 32;
}
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const fakePhone = () => `020${String(int(0, 9999999)).padStart(7, "0")}`;

const VEHICLE_CATEGORIES = [
  ["RG SAL", "REGULAR SALOON"],
  ["EX SAL", "EXECUTIVE SALOON"],
  ["PR 4X4", "4X4 PRADO"],
  ["V8 4X4", "4X4 V8"],
  ["10 STR", "10 SEATER"],
  ["15 STR", "15 SEATER"],
  ["30 STR", "30 SEATER"],
  ["50 STR", "50 SEATER"],
  ["DC PKU", "DOUBLE CABIN PICKUP"],
] as const;

const VENDOR_CATEGORIES = [
  "TYRES",
  "CAR BATTERIES",
  "WINDSCREEN",
  "MAINTENANCE",
  "MISC PARTS",
  "AIRCONDITION REPAIRS",
  "PAINT SHOP",
  "CAR CLEANING",
  "OFFICE SUPPLIES",
];

/** Daily USD rates: [code, category, description, vehicle, driver allowance]. Levy 5%, VAT 12.5%, GETFund 1%. */
const RATES = [
  ["RG-SAL-ACC", "SALOON", "STANDARD SALOON - WITHIN ACCRA", 90, 10],
  ["EX-SAL-ACC", "SALOON", "EXECUTIVE SALOON - WITHIN ACCRA", 130, 10],
  ["PR-4X4-ACC", "4X4", "4X4 PRADO - WITHIN ACCRA", 150, 10],
  ["PR-4X4-OUT", "4X4", "4X4 PRADO - OUT OF ACCRA OVERNIGHT", 180, 30],
  ["V8-4X4-ACC", "4X4", "4X4 V8 - WITHIN ACCRA", 220, 10],
  ["V8-4X4-OUT", "4X4", "4X4 V8 - OUT OF ACCRA OVERNIGHT", 260, 30],
  ["15-STR-ACC", "BUS", "15 SEATER BUS - WITHIN ACCRA", 170, 15],
  ["15-STR-OUT", "BUS", "15 SEATER BUS - OUT OF ACCRA OVERNIGHT", 210, 30],
  ["30-STR-ACC", "BUS", "30 SEATER BUS - WITHIN ACCRA", 280, 20],
  ["50-STR-OUT", "BUS", "50 SEATER BUS - OUT OF ACCRA OVERNIGHT", 420, 40],
] as const;

const FIRST = ["KWAME", "AMA", "KOFI", "ABENA", "YAW", "AKOSUA", "KWEKU", "ADWOA", "KOJO", "EFUA", "KWABENA", "AFIA"];
const LAST = ["MENSAH", "OWUSU", "BOATENG", "ASANTE", "ADDO", "OSEI", "APPIAH", "DARKO", "QUAYE", "TETTEH", "OFORI", "ANSAH"];
const COMPANIES = [
  "ACME LOGISTICS LTD",
  "SAMPLE MINING CO",
  "DEMO BANK GHANA",
  "EXAMPLE EVENTS",
  "TEST TELECOMS LTD",
  "PLACEHOLDER NGO",
  "FICTIONAL HOTELS",
  "MOCK EMBASSY",
];
const DESTINATIONS = ["ACCRA", "KUMASI", "CAPE COAST", "TAKORADI", "AKOSOMBO", "ADA", "HO", "TAMALE", "KOFORIDUA", "AIRPORT"];
const VEHICLES = [
  ["TOYOTA", "COROLLA", "RG SAL"],
  ["TOYOTA", "CAMRY", "EX SAL"],
  ["TOYOTA", "LAND CRUISER PRADO", "PR 4X4"],
  ["TOYOTA", "LAND CRUISER V8", "V8 4X4"],
  ["TOYOTA", "HIACE", "15 STR"],
  ["TOYOTA", "COASTER", "30 STR"],
  ["NISSAN", "NAVARA", "DC PKU"],
  ["HYUNDAI", "ELANTRA", "RG SAL"],
] as const;
const VENDORS = [
  ["DEMO TYRE CENTRE", "TYRES"],
  ["SAMPLE BATTERY SHOP", "CAR BATTERIES"],
  ["EXAMPLE GLASS WORKS", "WINDSCREEN"],
  ["TEST AUTO SERVICES", "MAINTENANCE"],
  ["PLACEHOLDER SPARES", "MISC PARTS"],
  ["MOCK COOL AIR", "AIRCONDITION REPAIRS"],
  ["FAKE PAINT & BODY", "PAINT SHOP"],
  ["DEMO CAR WASH", "CAR CLEANING"],
] as const;

async function main() {
  if ((await db.user.count()) > 0) {
    console.log("Database already has users; skipping seed.");
    return;
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  const admin = await db.user.create({
    data: {
      username: "admin",
      fullName: "SYSTEM ADMINISTRATOR",
      designation: "SYSTEM ADMINISTRATOR",
      role: "ADMIN",
      passwordHash: await hashPassword(adminPassword),
    },
  });

  await db.vehicleCategory.createMany({ data: VEHICLE_CATEGORIES.map(([code, name]) => ({ code, name })) });
  await db.vendorCategory.createMany({ data: VENDOR_CATEGORIES.map((name) => ({ name })) });

  if (process.env.SEED_DEMO_DATA === "false") {
    console.log(`Seeded reference data. Sign in as admin / ${adminPassword}`);
    return;
  }

  await db.rate.createMany({
    data: RATES.map(([code, category, description, vehicleUsd, driverAllowanceUsd]) => {
      const levyUsd = vehicleUsd * 0.05;
      return {
        code,
        category,
        description,
        vehicleUsd,
        levyUsd,
        vatUsd: (vehicleUsd + levyUsd) * 0.125,
        getFundLevyUsd: vehicleUsd * 0.01,
        driverAllowanceUsd,
      };
    }),
  });

  const today = todayUtc();
  for (let i = 0; i < 30; i++) {
    await db.exchangeRate.create({
      data: { effectiveDate: addDays(today, -i * 3), usdToGhs: (12.4 + rand() * 0.8).toFixed(4), createdById: admin.id },
    });
  }

  const staff = await db.user.create({
    data: {
      username: "demo",
      fullName: "DEMO USER",
      designation: "RESERVATIONS OFFICER",
      role: "STAFF",
      passwordHash: await hashPassword("demo12345"),
    },
  });

  const categories = await db.vehicleCategory.findMany();
  const catByCode = Object.fromEntries(categories.map((c) => [c.code, c.id]));

  const vehicles = [];
  for (let i = 0; i < 14; i++) {
    const [make, model, cat] = VEHICLES[i % VEHICLES.length];
    vehicles.push(
      await db.vehicle.create({
        data: {
          regNumber: `GT ${1000 + i * 37}-${pick(["21", "22", "23", "24"])}`,
          make,
          model,
          categoryId: catByCode[cat],
          year: int(2016, 2024),
          country: "JAPAN",
          colour: pick(["WHITE", "SILVER", "BLACK", "GREY"]),
          transmission: pick(["AUTOMATIC", "MANUAL"]),
          chassisNumber: `DEMO${String(100000 + i)}`,
          engineNumber: `ENG${String(5000 + i)}`,
          roadworthyExpiry: addDays(today, int(-10, 300)),
          insuranceExpiry: addDays(today, int(-5, 300)),
          nextServiceDate: addDays(today, int(-3, 90)),
        },
      }),
    );
  }

  const drivers = [];
  for (let i = 0; i < 12; i++) {
    drivers.push(
      await db.driver.create({
        data: {
          firstName: FIRST[i],
          lastName: LAST[(i * 5) % LAST.length],
          phone: fakePhone(),
          licenceClass: pick(["B", "C", "D", "E"]),
          designation: "DRIVER",
          inService: i < 10,
        },
      }),
    );
  }

  const rates = await db.rate.findMany();
  const vendorCats = await db.vendorCategory.findMany();
  const vendors = [];
  for (const [name, cat] of VENDORS) {
    vendors.push(
      await db.vendor.create({
        data: {
          name,
          categoryId: vendorCats.find((c) => c.name === cat)?.id,
          contactPerson: `${pick(FIRST)} ${pick(LAST)}`,
          address: `${int(1, 99)} DEMO STREET, ACCRA`,
          phone: fakePhone(),
          paymentType: pick(["CASH", "CHEQUE", "CREDIT"]),
          creditTermDays: pick([0, 14, 30]),
        },
      }),
    );
  }

  // Reservations spread over the past 6 months and the next month.
  for (let i = 0; i < 80; i++) {
    const start = addDays(today, int(-180, 30));
    const end = addDays(start, int(0, 4));
    const vehicle = pick(vehicles);
    // Price with a rate for the same kind of vehicle (pickups use the 4X4 rates).
    const catCode = categories.find((c) => c.id === vehicle.categoryId)?.code ?? "";
    const prefix = catCode === "DC PKU" ? "PR-4X4" : catCode.replace(" ", "-");
    const matching = rates.filter((r) => r.code.startsWith(prefix));
    const rate = pick(matching.length ? matching : rates);
    const company = pick(COMPANIES);
    const past = end < today;
    const status = past ? (rand() < 0.85 ? "CLOSED" : "CANCELLED") : start <= today ? "IN_PROGRESS" : "PENDING";
    const assigned = status !== "PENDING" || rand() < 0.4;
    const thirdParty = assigned && rand() < 0.15;
    await db.reservation.create({
      data: {
        companyName: company,
        contactName: `${pick(FIRST)} ${pick(LAST)}`,
        contactPhone: fakePhone(),
        vehicleCategoryId: vehicle.categoryId,
        startDate: start,
        endDate: end,
        destination: pick(DESTINATIONS),
        remarks: rand() < 0.3 ? "DEMO BOOKING" : null,
        status,
        source: assigned ? (thirdParty ? "THIRD_PARTY" : "IN_HOUSE") : null,
        // Demo data doesn't avoid double-booking; the API enforces that for real assignments.
        driverId: assigned && !thirdParty ? pick(drivers.slice(0, 10)).id : null,
        vehicleId: assigned && !thirdParty ? vehicle.id : null,
        externalDriver: thirdParty ? `${pick(FIRST)} - ${fakePhone()}` : null,
        externalVehicle: thirdParty ? `GW ${int(1000, 9999)}-20` : null,
        rateId: assigned ? rate.id : null,
        createdById: pick([admin.id, staff.id]),
      },
    });
  }

  for (let i = 0; i < 40; i++) {
    await db.serviceRecord.create({
      data: {
        vehicleId: pick(vehicles).id,
        serviceDate: addDays(today, int(-365, -1)),
        odometer: int(10000, 250000),
        garage: pick(["TEST AUTO SERVICES", "DEMO MOTORS", "SAMPLE GARAGE"]),
        garageLocation: pick(["ACCRA", "TEMA", "KUMASI"]),
        driverId: pick(drivers).id,
        details: pick(["OIL AND FILTER CHANGE", "BRAKE PADS REPLACED", "FULL SERVICE", "WHEEL ALIGNMENT", "AC REGAS"]),
        amount: int(200, 4000),
        createdById: staff.id,
      },
    });
  }

  const year = today.getUTCFullYear();
  for (let i = 1; i <= 15; i++) {
    await db.purchaseOrder.create({
      data: {
        number: `PO-${year}-${String(i).padStart(5, "0")}`,
        orderDate: addDays(today, int(-200, 0)),
        vendorId: pick(vendors).id,
        vehicleId: rand() < 0.6 ? pick(vehicles).id : null,
        status: pick(["PENDING", "APPROVED", "RECEIVED", "RECEIVED"] as const),
        createdById: admin.id,
        items: {
          create: Array.from({ length: int(1, 3) }, () => ({
            description: pick(["ALL-TERRAIN TYRE", "12V BATTERY", "FRONT WINDSCREEN", "BRAKE PADS (SET)", "ENGINE OIL 5L"]),
            unit: pick(["PCS", "SET", "LITRES"]),
            quantity: int(1, 4),
            unitPrice: int(50, 1500),
          })),
        },
      },
    });
  }

  const closed = await db.reservation.findMany({ where: { status: "CLOSED", rateId: { not: null } }, include: { rate: true }, take: 5 });
  for (const [i, r] of closed.entries()) {
    const days = Math.round((r.endDate.getTime() - r.startDate.getTime()) / 86400000) + 1;
    const rate = r.rate!;
    const daily = [rate.vehicleUsd, rate.levyUsd, rate.vatUsd, rate.getFundLevyUsd, rate.driverAllowanceUsd, rate.fuelUsd].reduce(
      (s, v) => s + Number(v),
      0,
    );
    await db.invoice.create({
      data: {
        number: `PF-${year}-${String(i + 1).padStart(5, "0")}`,
        invoiceDate: r.endDate,
        customerName: r.companyName,
        customerAddress: "P.O. BOX 123, ACCRA",
        usdToGhs: 12.8,
        createdById: admin.id,
        items: {
          create: [{ description: `${rate.description} (${r.destination})`, quantity: days, unitPrice: daily, rateId: rate.id, reservationId: r.id }],
        },
      },
    });
  }

  console.log("Seeded demo data.");
  console.log(`  admin / ${adminPassword}   (administrator)`);
  console.log("  demo  / demo12345          (staff)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
