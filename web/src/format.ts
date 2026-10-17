import type { Decimal } from "./types";

/** API dates are UTC midnight ISO strings; show them as calendar dates. */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** YYYY-MM-DD for <input type="date">. */
export function toInputDate(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtMoney(value: Decimal | null | undefined, currency?: "USD" | "GHS"): string {
  if (value == null || value === "") return "—";
  const n = Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "USD" ? `$${n}` : currency === "GHS" ? `GH₵${n}` : n;
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const target = new Date(value.slice(0, 10)).getTime();
  const now = new Date(today()).getTime();
  return Math.round((target - now) / 86400000);
}

export function dueLabel(value: string | null | undefined): string {
  const d = daysUntil(value);
  if (d == null) return "—";
  if (d < 0) return `${-d} day${d === -1 ? "" : "s"} overdue`;
  if (d === 0) return "due today";
  return `in ${d} day${d === 1 ? "" : "s"}`;
}

export const statusLabel: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  APPROVED: "Approved",
  RECEIVED: "Received",
  IN_HOUSE: "In-house",
  THIRD_PARTY: "Third party",
};
