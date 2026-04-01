import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { buildServer } from "./server.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "./db/embedded.js";
import { loadGlobalConfig } from "./config/loader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(__dirname, "db", "migrations");

// 1. Load global config
const configPath = join(homedir(), ".orch8", "config.yaml");
const config = loadGlobalConfig(configPath);

// 2. Connect to Postgres
const databaseUrl = await startEmbeddedPostgres({
  port: Number(process.env.ORCH_PG_PORT ?? config.database.port),
});

// 3. Run migrations
if (config.database.auto_migrate !== false) {
  const migrationSql = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(migrationSql), { migrationsFolder });
  await migrationSql.end();
}

// 4–7. Build and start server (services, scheduler all inside)
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
