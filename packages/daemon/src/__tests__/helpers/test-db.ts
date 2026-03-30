import { fileURLToPath } from "node:url";
import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "@orch/shared/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../db/migrations");

export type TestDb = {
  db: PostgresJsDatabase<typeof schema>;
  sql: postgres.Sql;
  container: StartedPostgreSqlContainer;
};

export async function setupTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:17")
    .withDatabase("orch_test")
    .start();

  const connectionUri = container.getConnectionUri();

  // Apply migrations
  const migrationSql = postgres(connectionUri, { max: 1 });
  await migrate(drizzle(migrationSql), {
    migrationsFolder,
  });
  await migrationSql.end();

  // Create app client with schema
  const sqlClient = postgres(connectionUri, { max: 5 });
  const db = drizzle(sqlClient, { schema });

  return { db, sql: sqlClient, container };
}

export async function teardownTestDb(testDb: TestDb): Promise<void> {
  await testDb.sql.end();
  await testDb.container.stop();
}
