import { Router } from "express";
import { z } from "zod";
import { db } from "../lib/db.js";
import { addDays, itemsTotal, todayUtc } from "../lib/calc.js";

/** Dashboard and reports. */

const RENEWAL_WINDOW_DAYS = 60;

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res) => {
  const today = todayUtc();
  const horizon = addDays(today, RENEWAL_WINDOW_DAYS);
  const vehicleSelect = { id: true, regNumber: true, make: true, model: true, roadworthyExpiry: true, insuranceExpiry: true };

  const [
    users,
    vehicles,
    drivers,
    vendors,
    statusCounts,
    roadworthy,
    insurance,
    serviceDue,
    upcoming,
    latestRate,
    pendingPOs,
  ] = await Promise.all([
    db.user.count({ where: { active: true } }),
    db.vehicle.count({ where: { active: true } }),
    db.driver.count({ where: { inService: true } }),
    db.vendor.count(),
    db.reservation.groupBy({ by: ["status"], _count: true }),
    db.vehicle.findMany({
      where: { active: true, roadworthyExpiry: { lte: horizon } },
      select: vehicleSelect,
      orderBy: { roadworthyExpiry: "asc" },
    }),
    db.vehicle.findMany({
      where: { active: true, insuranceExpiry: { lte: horizon } },
      select: vehicleSelect,
      orderBy: { insuranceExpiry: "asc" },
    }),
    db.vehicle.findMany({
      where: { active: true, nextServiceDate: { lte: addDays(today, 14) } },
      select: { id: true, regNumber: true, make: true, model: true, nextServiceDate: true },
      orderBy: { nextServiceDate: "asc" },
    }),
    db.reservation.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] }, startDate: { gte: today, lte: addDays(today, 7) } },
      select: { id: true, companyName: true, destination: true, startDate: true, endDate: true, status: true },
      orderBy: { startDate: "asc" },
      take: 20,
    }),
    db.exchangeRate.findFirst({ orderBy: { effectiveDate: "desc" } }),
    db.purchaseOrder.count({ where: { status: "PENDING" } }),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count]));
  res.json({
    counts: {
      users,
      vehicles,
      drivers,
      vendors,
      pendingPurchaseOrders: pendingPOs,
      reservations: {
        total: statusCounts.reduce((sum, s) => sum + s._count, 0),
        PENDING: byStatus.PENDING ?? 0,
        IN_PROGRESS: byStatus.IN_PROGRESS ?? 0,
        CLOSED: byStatus.CLOSED ?? 0,
        CANCELLED: byStatus.CANCELLED ?? 0,
      },
    },
    renewalWindowDays: RENEWAL_WINDOW_DAYS,
    roadworthyDue: roadworthy,
    insuranceDue: insurance,
    serviceDue,
    upcomingReservations: upcoming,
    exchangeRate: latestRate,
    exchangeRateIsCurrent: latestRate?.effectiveDate.getTime() === today.getTime(),
  });
});

export const reportsRouter = Router();

reportsRouter.get("/", async (req, res) => {
  const range = z
    .object({ from: z.iso.date().optional(), to: z.iso.date().optional() })
    .parse(req.query);
  const to = range.to ? new Date(range.to) : todayUtc();
  const from = range.from ? new Date(range.from) : addDays(to, -365);

  const [reservations, services, pos, invoices] = await Promise.all([
    db.reservation.findMany({
      where: { startDate: { gte: from, lte: to } },
      select: { startDate: true, status: true, companyName: true, source: true },
    }),
    db.serviceRecord.findMany({
      where: { serviceDate: { gte: from, lte: to } },
      select: { amount: true, vehicle: { select: { id: true, regNumber: true } } },
    }),
    db.purchaseOrder.findMany({
      where: { orderDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { vendor: { select: { id: true, name: true } }, items: { select: { quantity: true, unitPrice: true } } },
    }),
    db.invoice.findMany({
      where: { invoiceDate: { gte: from, lte: to } },
      select: { items: { select: { quantity: true, unitPrice: true } } },
    }),
  ]);

  const byMonth = new Map<string, Record<string, number>>();
  const byCustomer = new Map<string, number>();
  for (const r of reservations) {
    const month = r.startDate.toISOString().slice(0, 7);
    const row = byMonth.get(month) ?? { PENDING: 0, IN_PROGRESS: 0, CLOSED: 0, CANCELLED: 0 };
    row[r.status] += 1;
    byMonth.set(month, row);
    if (r.status !== "CANCELLED") byCustomer.set(r.companyName, (byCustomer.get(r.companyName) ?? 0) + 1);
  }

  const serviceByVehicle = new Map<string, { regNumber: string; count: number; amount: number }>();
  for (const s of services) {
    const row = serviceByVehicle.get(s.vehicle.regNumber) ?? { regNumber: s.vehicle.regNumber, count: 0, amount: 0 };
    row.count += 1;
    row.amount += Number(s.amount);
    serviceByVehicle.set(s.vehicle.regNumber, row);
  }

  const poByVendor = new Map<string, { vendor: string; count: number; amount: number }>();
  for (const po of pos) {
    const row = poByVendor.get(po.vendor.name) ?? { vendor: po.vendor.name, count: 0, amount: 0 };
    row.count += 1;
    row.amount += itemsTotal(po.items);
    poByVendor.set(po.vendor.name, row);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  res.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    reservationsByMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, c]) => ({ month, ...c })),
    topCustomers: [...byCustomer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([companyName, count]) => ({ companyName, count })),
    sourceSplit: {
      IN_HOUSE: reservations.filter((r) => r.source === "IN_HOUSE").length,
      THIRD_PARTY: reservations.filter((r) => r.source === "THIRD_PARTY").length,
    },
    serviceSpendByVehicle: [...serviceByVehicle.values()].map((r) => ({ ...r, amount: round(r.amount) })).sort((a, b) => b.amount - a.amount),
    purchaseSpendByVendor: [...poByVendor.values()].map((r) => ({ ...r, amount: round(r.amount) })).sort((a, b) => b.amount - a.amount),
    totals: {
      reservations: reservations.length,
      serviceSpend: round(services.reduce((s, r) => s + Number(r.amount), 0)),
      purchaseSpend: round(pos.reduce((s, po) => s + itemsTotal(po.items), 0)),
      invoicedUsd: round(invoices.reduce((s, inv) => s + itemsTotal(inv.items), 0)),
    },
  });
});
