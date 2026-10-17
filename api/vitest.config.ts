import fs from "node:fs";
import { defineConfig } from "vitest/config";

// Tests run against a separate database: <DATABASE_URL>_test, or TEST_DATABASE_URL if set.
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const base = process.env.DATABASE_URL ?? "";
const testUrl = process.env.TEST_DATABASE_URL ?? base.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");
// Set on the main process too, so global setup and workers both see the test database.
Object.assign(process.env, { DATABASE_URL: testUrl, JWT_SECRET: "test-secret", NODE_ENV: "test" });

export default defineConfig({
  test: {
    globalSetup: "./test/global-setup.ts",
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
