import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { db } from "../src/lib/db.js";
import { createUser, resetDb, signIn } from "./helpers.js";

let agent: Agent;
let driverId: number;
let vehicleId: number;
let rateId: number;

beforeEach(async () => {
  await resetDb();
  await createUser("staff", "STAFF");
  agent = await signIn("staff");
  driverId = (await db.driver.create({ data: { firstName: "KOFI", lastName: "MENSAH" } })).id;
  vehicleId = (await db.vehicle.create({ data: { regNumber: "GT 1-24", make: "TOYOTA", model: "HIACE" } })).id;
  rateId = (
    await db.rate.create({
      data: { code: "R1", category: "BUS", description: "BUS", vehicleUsd: 100, levyUsd: 5, vatUsd: 13.125, getFundLevyUsd: 1, driverAllowanceUsd: 10 },
    })
  ).id;
});
afterAll(() => db.$disconnect());

const booking = (over: Record<string, unknown> = {}) => ({
  companyName: "acme ltd",
  contactName: "ama",
  contactPhone: "0200000000",
  startDate: "2026-03-01",
  endDate: "2026-03-03",
  destination: "kumasi",
  ...over,
});

describe("reservations", () => {
  it("creates a pending reservation with computed days", async () => {
    const res = await agent.post("/api/reservations").send(booking());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING", companyName: "ACME LTD", destination: "KUMASI", days: 3 });
  });

  it("validates dates", async () => {
    const res = await agent.post("/api/reservations").send(booking({ endDate: "2026-02-01" }));
    expect(res.status).toBe(400);
    expect(res.body.issues[0].path).toBe("endDate");
  });

  it("won't start until source, driver, vehicle and rate are assigned", async () => {
    const { body: r } = await agent.post("/api/reservations").send(booking());
    const blocked = await agent.post(`/api/reservations/${r.id}/start`).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/source.*rate code/);

    const assigned = await agent.post(`/api/reservations/${r.id}/assign`).send({ source: "IN_HOUSE", driverId, vehicleId, rateId });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({ driverName: "KOFI MENSAH", vehicleReg: "GT 1-24", estimatedTotalUsd: 387.38 });

    const started = await agent.post(`/api/reservations/${r.id}/start`).send({});
    expect(started.body.status).toBe("IN_PROGRESS");
    const closed = await agent.post(`/api/reservations/${r.id}/close`).send({});
    expect(closed.body.status).toBe("CLOSED");

    // Closed reservations are locked.
    expect((await agent.post(`/api/reservations/${r.id}/cancel`).send({})).status).toBe(409);
    expect((await agent.put(`/api/reservations/${r.id}`).send(booking())).status).toBe(409);
  });

  it("supports third-party assignments with free-text driver and vehicle", async () => {
    const { body: r } = await agent.post("/api/reservations").send(booking());
    const res = await agent
      .post(`/api/reservations/${r.id}/assign`)
      .send({ source: "THIRD_PARTY", externalDriver: "KWAME - 0244", externalVehicle: "GW 99-20", rateId, driverId });
    expect(res.body).toMatchObject({ driverId: null, driverName: "KWAME - 0244", vehicleReg: "GW 99-20" });
    expect((await agent.post(`/api/reservations/${r.id}/start`).send({})).status).toBe(200);
  });

  it("prevents double-booking a driver or vehicle on overlapping dates", async () => {
    const { body: a } = await agent.post("/api/reservations").send(booking());
    const { body: b } = await agent.post("/api/reservations").send(booking({ startDate: "2026-03-03", endDate: "2026-03-05" }));
    const { body: c } = await agent.post("/api/reservations").send(booking({ startDate: "2026-03-04", endDate: "2026-03-05" }));
    await agent.post(`/api/reservations/${a.id}/assign`).send({ source: "IN_HOUSE", vehicleId });

    const clash = await agent.post(`/api/reservations/${b.id}/assign`).send({ source: "IN_HOUSE", vehicleId });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toMatch(/vehicle is already booked/);

    expect((await agent.post(`/api/reservations/${c.id}/assign`).send({ source: "IN_HOUSE", vehicleId })).status).toBe(200);

    // Cancelling frees the vehicle.
    await agent.post(`/api/reservations/${a.id}/cancel`).send({});
    await agent.post(`/api/reservations/${c.id}/assign`).send({ source: "IN_HOUSE", vehicleId: null });
    expect((await agent.post(`/api/reservations/${b.id}/assign`).send({ source: "IN_HOUSE", vehicleId })).status).toBe(200);
  });

  it("refuses drivers who are out of service", async () => {
    await db.driver.update({ where: { id: driverId }, data: { inService: false } });
    const { body: r } = await agent.post("/api/reservations").send(booking());
    const res = await agent.post(`/api/reservations/${r.id}/assign`).send({ source: "IN_HOUSE", driverId });
    expect(res.status).toBe(409);
  });

  it("duplicates a reservation as a new pending booking", async () => {
    const { body: r } = await agent.post("/api/reservations").send(booking());
    await agent.post(`/api/reservations/${r.id}/cancel`).send({});
    const dup = await agent.post(`/api/reservations/${r.id}/duplicate`).send({ startDate: "2026-04-01", endDate: "2026-04-01" });
    expect(dup.status).toBe(201);
    expect(dup.body).toMatchObject({ status: "PENDING", companyName: "ACME LTD", days: 1 });
    expect(dup.body.id).not.toBe(r.id);
  });

  it("filters by status and searches", async () => {
    const { body: r } = await agent.post("/api/reservations").send(booking());
    await agent.post("/api/reservations").send(booking({ companyName: "other co" }));
    await agent.post(`/api/reservations/${r.id}/cancel`).send({});
    expect((await agent.get("/api/reservations?status=cancelled")).body).toHaveLength(1);
    expect((await agent.get("/api/reservations?q=other")).body).toHaveLength(1);
  });
});
