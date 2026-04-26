import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  startEmbeddedPostgres,
  stopEmbeddedPostgres,
} from "../../db/embedded.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../db/migrations");
const templateDbName = "orch8_test_template";

function databaseUri(connectionUri: string, databaseName: string): string {
  const url = new URL(connectionUri);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export default async function setup() {
  const dataDir = path.join(os.tmpdir(), `orch8-test-${randomUUID()}`);

  try {
    const baseUri = await startEmbeddedPostgres({
      databaseDir: dataDir,
      port: 0,
      persistent: false,
    });

    const admin = postgres(baseUri, { max: 1 });
    try {
      await admin.unsafe(
        `CREATE DATABASE ${quoteIdentifier(templateDbName)}`,
      );
    } finally {
      await admin.end();
    }

    const templateUri = databaseUri(baseUri, templateDbName);
    const migrationSql = postgres(templateUri, { max: 1 });
    try {
      await migrate(drizzle(migrationSql), { migrationsFolder });
    } finally {
      await migrationSql.end();
    }

    process.env.ORCH8_TEST_PG_URI = baseUri;
    process.env.ORCH8_TEST_PG_TEMPLATE = templateDbName;

    return async () => {
      delete process.env.ORCH8_TEST_PG_URI;
      delete process.env.ORCH8_TEST_PG_TEMPLATE;
      await stopEmbeddedPostgres();
      await rm(dataDir, { recursive: true, force: true });
    };
  } catch (err) {
    await stopEmbeddedPostgres();
    await rm(dataDir, { recursive: true, force: true });
    throw err;
  }
}
