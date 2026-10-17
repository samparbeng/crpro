import type { Prisma } from "@prisma/client";

type Num = Prisma.Decimal | number | string | null | undefined;
const n = (v: Num) => (v == null ? 0 : Number(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inclusive number of days, e.g. 24th → 24th is 1 day (matches TransPro). */
export function reservationDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

export function rateTotals(rate: {
  vehicleUsd: Num;
  levyUsd: Num;
  vatUsd: Num;
  getFundLevyUsd: Num;
  driverAllowanceUsd: Num;
  fuelUsd: Num;
}) {
  const subtotalUsd = n(rate.vehicleUsd) + n(rate.levyUsd);
  const totalUsd =
    subtotalUsd + n(rate.vatUsd) + n(rate.getFundLevyUsd) + n(rate.driverAllowanceUsd) + n(rate.fuelUsd);
  return { subtotalUsd: round2(subtotalUsd), totalUsd: Math.round(totalUsd * 1000) / 1000 };
}

export function lineTotal(item: { quantity: Num; unitPrice: Num }) {
  return round2(n(item.quantity) * n(item.unitPrice));
}

export function itemsTotal(items: { quantity: Num; unitPrice: Num }[]) {
  return round2(items.reduce((sum, i) => sum + lineTotal(i), 0));
}

export function invoiceTotals(invoice: {
  amountPaid: Num;
  usdToGhs: Num;
  items: { quantity: Num; unitPrice: Num }[];
}) {
  const totalUsd = itemsTotal(invoice.items);
  const amountDueUsd = round2(totalUsd - n(invoice.amountPaid));
  const totalGhs = invoice.usdToGhs == null ? null : round2(totalUsd * n(invoice.usdToGhs));
  return { totalUsd, amountDueUsd, totalGhs };
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayUtc(): Date {
  return new Date(toDateString(new Date()));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}
