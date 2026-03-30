import { buildServer } from "./server.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "./db/embedded.js";
import { DEFAULT_PORT, DEFAULT_HOST } from "@orch/shared";

const databaseUrl = await startEmbeddedPostgres({
  port: Number(process.env.ORCH_PG_PORT ?? 5433),
});

const server = buildServer({ databaseUrl });

// Graceful shutdown
async function shutdown() {
  await server.close();
  await stopEmbeddedPostgres();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await server.listen({
    port: Number(process.env.ORCH_PORT ?? DEFAULT_PORT),
    host: process.env.ORCH_HOST ?? DEFAULT_HOST,
  });
} catch (err) {
  server.log.error(err);
  await stopEmbeddedPostgres();
  process.exit(1);
}
