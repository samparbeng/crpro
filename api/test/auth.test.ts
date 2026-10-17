import crypto from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/lib/db.js";
import { app, createUser, resetDb, signIn } from "./helpers.js";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("auth", () => {
  it("signs in, returns the current user, and signs out", async () => {
    await createUser("alice", "STAFF");
    const agent = await signIn("alice");
    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ username: "alice", role: "STAFF" });
    expect(me.body.passwordHash).toBeUndefined();

    await agent.post("/api/auth/logout");
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    await createUser("alice", "STAFF");
    const res = await request(app).post("/api/auth/login").send({ username: "alice", password: "nope" });
    expect(res.status).toBe(401);
  });

  it("rejects deactivated users", async () => {
    const u = await createUser("alice", "STAFF");
    await db.user.update({ where: { id: u.id }, data: { active: false } });
    const res = await request(app).post("/api/auth/login").send({ username: "alice", password: "password123" });
    expect(res.status).toBe(401);
  });

  it("accepts legacy MD5 passwords and upgrades them to bcrypt", async () => {
    const md5 = crypto.createHash("md5").update("oldpass").digest("hex");
    await db.user.create({ data: { username: "legacy", fullName: "LEGACY", passwordHash: `md5:${md5}` } });
    await signIn("legacy", "oldpass");
    const user = await db.user.findUniqueOrThrow({ where: { username: "legacy" } });
    expect(user.passwordHash.startsWith("$2")).toBe(true);
    await signIn("legacy", "oldpass");
  });

  it("requires authentication for API routes", async () => {
    expect((await request(app).get("/api/reservations")).status).toBe(401);
  });

  it("rejects non-JSON mutating requests (CSRF guard)", async () => {
    await createUser("alice", "STAFF");
    const agent = await signIn("alice");
    const res = await agent.post("/api/drivers").type("form").send("firstName=A&lastName=B");
    expect(res.status).toBe(415);
  });

  it("changes password", async () => {
    await createUser("alice", "STAFF");
    const agent = await signIn("alice");
    const bad = await agent.post("/api/auth/change-password").send({ currentPassword: "x", newPassword: "newpassword1" });
    expect(bad.status).toBe(400);
    const ok = await agent.post("/api/auth/change-password").send({ currentPassword: "password123", newPassword: "newpassword1" });
    expect(ok.status).toBe(204);
    await signIn("alice", "newpassword1");
  });
});

describe("users (admin only)", () => {
  it("lets admins create users and blocks staff", async () => {
    await createUser("admin", "ADMIN");
    await createUser("staff", "STAFF");
    const staff = await signIn("staff");
    expect((await staff.get("/api/users")).status).toBe(403);

    const admin = await signIn("admin");
    const res = await admin.post("/api/users").send({ username: "bob", fullName: "Bob", role: "STAFF", password: "bobpassword" });
    expect(res.status).toBe(201);
    expect(res.body.passwordHash).toBeUndefined();
    await signIn("bob", "bobpassword");
  });

  it("stops admins from deactivating themselves", async () => {
    const me = await createUser("admin", "ADMIN");
    const admin = await signIn("admin");
    const res = await admin.put(`/api/users/${me.id}`).send({ active: false });
    expect(res.status).toBe(400);
  });

  it("rejects duplicate usernames with 409", async () => {
    await createUser("admin", "ADMIN");
    const admin = await signIn("admin");
    const res = await admin.post("/api/users").send({ username: "admin", fullName: "X", role: "STAFF", password: "password123" });
    expect(res.status).toBe(409);
  });
});
