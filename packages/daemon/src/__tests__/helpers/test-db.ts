import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@orch/shared/db";

export type TestDb = {
  db: PostgresJsDatabase<typeof schema>;
  sql: postgres.Sql;
  connectionUri: string;
};

function databaseUri(connectionUri: string, databaseName: string): string {
  const url = new URL(connectionUri);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function databaseNameFromUri(connectionUri: string): string {
  const url = new URL(connectionUri);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export async function setupTestDb(): Promise<TestDb> {
  const baseUri = process.env.ORCH8_TEST_PG_URI;
  const template = process.env.ORCH8_TEST_PG_TEMPLATE;

  if (!baseUri || !template) {
    throw new Error(
      "globalSetup did not run; ORCH8_TEST_PG_URI or ORCH8_TEST_PG_TEMPLATE missing",
    );
  }

  const dbName = `orch8_test_${randomUUID().replace(/-/g, "")}`;
  const admin = postgres(baseUri, { max: 1 });
  try {
    await admin.unsafe(
      `CREATE DATABASE ${quoteIdentifier(dbName)} TEMPLATE ${quoteIdentifier(template)}`,
    );
  } finally {
    await admin.end();
  }

  const connectionUri = databaseUri(baseUri, dbName);
  const sqlClient = postgres(connectionUri, { max: 5 });
  const db = drizzle(sqlClient, { schema });

  return { db, sql: sqlClient, connectionUri };
}

export async function teardownTestDb(testDb: TestDb): Promise<void> {
  await testDb.sql.end();

  const baseUri = process.env.ORCH8_TEST_PG_URI;
  if (!baseUri) {
    return;
  }

  const dbName = databaseNameFromUri(testDb.connectionUri);
  const admin = postgres(baseUri, { max: 1 });
  try {
    await admin`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${dbName} AND pid <> pg_backend_pid()
    `;
    await admin.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)}`,
    );
  } finally {
    await admin.end();
  }
}
