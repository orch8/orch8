import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient, type DbClient } from "../db/client.js";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "../db/embedded.js";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

describe("Database Client", () => {
  let db: DbClient;

  beforeAll(async () => {
    const dataDir = path.join(os.tmpdir(), `orch8-test-${randomUUID()}`);
    const connectionUri = await startEmbeddedPostgres({
      databaseDir: dataDir,
      port: 0,
      persistent: false,
    });

    db = createDbClient(connectionUri);
  }, 60_000);

  afterAll(async () => {
    await db.close();
    await stopEmbeddedPostgres();
  });

  it("connects and runs a raw query", async () => {
    const result = await db.sql`SELECT 1 as value`;
    expect(result[0].value).toBe(1);
  });

  it("creates a table and inserts a row", async () => {
    await db.sql`CREATE TABLE IF NOT EXISTS test_connection (id serial PRIMARY KEY, name text NOT NULL)`;
    await db.sql`INSERT INTO test_connection (name) VALUES ('orch8')`;
    const rows = await db.sql`SELECT name FROM test_connection`;
    expect(rows[0].name).toBe("orch8");
  });
});
