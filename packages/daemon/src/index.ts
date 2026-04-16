import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { buildServer } from "./server.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "./db/embedded.js";
import { loadGlobalConfig } from "./config/loader.js";
import { loadOrGenerateAdminToken, defaultAdminTokenPath } from "./api/middleware/admin-token.js";

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

// 4. Load or generate the admin bearer token. Persisted to
//    ~/.orch8/admin-token with mode 0600 so only the local user can
//    read it. Clients use it as `Authorization: Bearer <token>`.
const adminTokenPath = process.env.ORCH_ADMIN_TOKEN_PATH ?? defaultAdminTokenPath();
const { token: adminToken, generated: tokenGenerated } =
  await loadOrGenerateAdminToken(adminTokenPath);

// 5. Build the server.
const server = buildServer({ databaseUrl, config, adminToken });

if (tokenGenerated) {
  server.log.info(
    { path: adminTokenPath },
    "Generated new admin token (read from file for dashboard/API calls)",
  );
}

// Graceful shutdown
async function shutdown() {
  await server.close();
  await stopEmbeddedPostgres();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 6. Warn before listening when the daemon is bound to a non-loopback
//    interface without an admin token or with the loopback-bypass on —
//    both cases expose admin endpoints to the network.
const bindHost = process.env.ORCH_HOST ?? config.api.host;
const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(bindHost);
if (!isLoopback) {
  if (!adminToken) {
    server.log.warn(
      { bindHost, adminTokenPath },
      "Daemon is binding to a non-loopback interface with NO admin token generated. Admin endpoints will be unreachable until a token exists. Start the daemon once bound to localhost to provision one, then move the token to this host.",
    );
  } else if (config.auth.allow_localhost_admin) {
    server.log.warn(
      { bindHost },
      "auth.allow_localhost_admin=true on a non-loopback bind grants admin to anyone with a local-looking source IP. Consider disabling this flag in production.",
    );
  }
}

// 7. Await cold-start initialization (skills copy, per-project sync,
//    chat-agent backfill) BEFORE accepting any connections. This
//    closes the race where the first request could arrive before
//    the skills index / chat agents finished provisioning.
if (server.initPromise) {
  await server.initPromise;
}

try {
  await server.listen({
    port: Number(process.env.ORCH_PORT ?? config.api.port),
    host: bindHost,
  });
} catch (err) {
  server.log.error(err);
  await stopEmbeddedPostgres();
  process.exit(1);
}
