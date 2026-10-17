import { execSync } from "node:child_process";

/** Applies migrations to the test database. Each test file clears its own rows (see resetDb). */
export default function setup() {
  const url = process.env.DATABASE_URL;
  if (!url || !/_test(\?|$)/.test(url)) throw new Error(`Refusing to run tests against non-test database: ${url}`);
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
