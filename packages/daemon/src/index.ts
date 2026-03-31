import { join } from "node:path";
import { homedir } from "node:os";
import { buildServer } from "./server.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "./db/embedded.js";
import { loadGlobalConfig } from "./config/loader.js";

// 1. Load global config
const configPath = join(homedir(), ".orchestrator", "config.yaml");
const config = loadGlobalConfig(configPath);

// 2. Connect to Postgres
const databaseUrl = await startEmbeddedPostgres({
  port: Number(process.env.ORCH_PG_PORT ?? config.database.port),
});

// 3–7. Build and start server (migrations, services, scheduler all inside)
const server = buildServer({ databaseUrl, config });

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
    port: Number(process.env.ORCH_PORT ?? config.api.port),
    host: process.env.ORCH_HOST ?? config.api.host,
  });
} catch (err) {
  server.log.error(err);
  await stopEmbeddedPostgres();
  process.exit(1);
}
