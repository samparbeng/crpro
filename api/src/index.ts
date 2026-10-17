import { createApp } from "./app.js";
import { db } from "./lib/db.js";
import { env } from "./lib/env.js";

const server = createApp().listen(env.port, () => {
  console.log(`crpro API listening on :${env.port}`);
});

async function shutdown() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
