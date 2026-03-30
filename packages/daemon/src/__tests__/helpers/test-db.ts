import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@orch/shared/db";
import {
  startEmbeddedPostgres,
  stopEmbeddedPostgres,
} from "../../db/embedded.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../db/migrations");

export type TestDb = {
  db: PostgresJsDatabase<typeof schema>;
  sql: postgres.Sql;
  connectionUri: string;
};

export async function setupTestDb(): Promise<TestDb> {
  const dataDir = path.join(os.tmpdir(), `orch8-test-${randomUUID()}`);
  const connectionUri = await startEmbeddedPostgres({
    databaseDir: dataDir,
    port: 0,
    persistent: false,
  });

  // Apply migrations
  const migrationSql = postgres(connectionUri, { max: 1 });
  await migrate(drizzle(migrationSql), {
    migrationsFolder,
  });
  await migrationSql.end();

  // Create app client with schema
  const sqlClient = postgres(connectionUri, { max: 5 });
  const db = drizzle(sqlClient, { schema });

  return { db, sql: sqlClient, connectionUri };
}

export async function teardownTestDb(testDb: TestDb): Promise<void> {
  await testDb.sql.end();
  await stopEmbeddedPostgres();
}
