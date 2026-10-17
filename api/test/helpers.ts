import request from "supertest";
import { createApp } from "../src/app.js";
import { db } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/auth.js";

export const app = createApp();

/** Wipes all tables (children first). */
export async function resetDb() {
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.purchaseOrderItem.deleteMany();
  await db.purchaseOrder.deleteMany();
  await db.serviceRecord.deleteMany();
  await db.reservation.deleteMany();
  await db.exchangeRate.deleteMany();
  await db.vendor.deleteMany();
  await db.vendorCategory.deleteMany();
  await db.vehicle.deleteMany();
  await db.vehicleCategory.deleteMany();
  await db.driver.deleteMany();
  await db.rate.deleteMany();
  await db.user.deleteMany();
}

export async function createUser(username: string, role: "ADMIN" | "STAFF", password = "password123") {
  return db.user.create({
    data: { username, fullName: username.toUpperCase(), role, passwordHash: await hashPassword(password) },
  });
}

/** Returns a supertest agent that is signed in as the given user. */
export async function signIn(username: string, password = "password123") {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
