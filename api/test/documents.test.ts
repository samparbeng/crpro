import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { db } from "../src/lib/db.js";
import { createUser, resetDb, signIn } from "./helpers.js";

let staff: Agent;
let admin: Agent;
let vendorId: number;

beforeEach(async () => {
  await resetDb();
  await createUser("staff", "STAFF");
  await createUser("admin", "ADMIN");
  staff = await signIn("staff");
  admin = await signIn("admin");
  vendorId = (await db.vendor.create({ data: { name: "DEMO TYRES" } })).id;
});
afterAll(() => db.$disconnect());

const year = new Date().getUTCFullYear();

describe("purchase orders", () => {
  const po = {
    orderDate: "2026-05-01",
    vendorId: 0,
    items: [
      { description: "Tyre", unit: "PCS", quantity: 4, unitPrice: 125.5 },
      { description: "Valve", quantity: 4, unitPrice: 2.25 },
    ],
  };

  it("numbers POs sequentially and totals line items", async () => {
    const a = await staff.post("/api/purchase-orders").send({ ...po, vendorId });
    const b = await staff.post("/api/purchase-orders").send({ ...po, vendorId });
    expect(a.status).toBe(201);
    expect(a.body.number).toBe(`PO-${year}-00001`);
    expect(b.body.number).toBe(`PO-${year}-00002`);
    expect(a.body.total).toBe(511);
    expect(a.body.items[0].total).toBe(502);
  });

  it("replaces items on update", async () => {
    const { body } = await staff.post("/api/purchase-orders").send({ ...po, vendorId });
    const res = await staff.put(`/api/purchase-orders/${body.id}`).send({ ...po, vendorId, items: [{ description: "X", quantity: 1, unitPrice: 10 }] });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(10);
  });

  it("requires at least one item", async () => {
    expect((await staff.post("/api/purchase-orders").send({ ...po, vendorId, items: [] })).status).toBe(400);
  });

  it("only lets admins delete, and blocks deleting vendors that have POs", async () => {
    const { body } = await staff.post("/api/purchase-orders").send({ ...po, vendorId });
    expect((await admin.delete(`/api/vendors/${vendorId}`)).status).toBe(409);
    expect((await staff.delete(`/api/purchase-orders/${body.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/purchase-orders/${body.id}`)).status).toBe(204);
  });
});

describe("invoices", () => {
  it("snapshots the latest exchange rate and computes totals", async () => {
    await admin.post("/api/exchange-rates").send({ usdToGhs: 12.5, effectiveDate: "2026-04-30" });
    await admin.post("/api/exchange-rates").send({ usdToGhs: 99, effectiveDate: "2026-06-01" });
    const res = await staff.post("/api/invoices").send({
      invoiceDate: "2026-05-01",
      customerName: "acme",
      amountPaid: 100,
      items: [{ description: "Bus hire", quantity: 3, unitPrice: 129.125 }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      number: `PF-${year}-00001`,
      customerName: "ACME",
      totalUsd: 387.38,
      amountDueUsd: 287.38,
      totalGhs: 4842.25,
    });
  });
});

describe("rates and exchange rates", () => {
  it("computes rate totals", async () => {
    const res = await admin.post("/api/rates").send({
      code: "rg-sal-acc",
      category: "saloon",
      description: "saloon",
      vehicleUsd: 100,
      levyUsd: 5,
      vatUsd: 13.125,
      getFundLevyUsd: 1,
      driverAllowanceUsd: 10,
    });
    expect(res.body).toMatchObject({ code: "RG-SAL-ACC", subtotalUsd: 105, totalUsd: 129.125 });
  });

  it("only admins can set exchange rates; same-day updates replace", async () => {
    expect((await staff.post("/api/exchange-rates").send({ usdToGhs: 12 })).status).toBe(403);
    await admin.post("/api/exchange-rates").send({ usdToGhs: 12 });
    await admin.post("/api/exchange-rates").send({ usdToGhs: 13 });
    const list = await staff.get("/api/exchange-rates");
    expect(list.body).toHaveLength(1);
    expect(Number(list.body[0].usdToGhs)).toBe(13);
    const dash = await staff.get("/api/dashboard");
    expect(dash.body.exchangeRateIsCurrent).toBe(true);
  });
});

describe("dashboard", () => {
  it("lists vehicles with renewals due soon, including overdue", async () => {
    const soon = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
    const later = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
    await admin.post("/api/vehicles").send({ regNumber: "A", make: "X", model: "Y", insuranceExpiry: soon, roadworthyExpiry: "2020-01-01" });
    await admin.post("/api/vehicles").send({ regNumber: "B", make: "X", model: "Y", insuranceExpiry: later });
    const { body } = await staff.get("/api/dashboard");
    expect(body.insuranceDue.map((v: { regNumber: string }) => v.regNumber)).toEqual(["A"]);
    expect(body.roadworthyDue.map((v: { regNumber: string }) => v.regNumber)).toEqual(["A"]);
    expect(body.counts.vehicles).toBe(2);
  });
});
