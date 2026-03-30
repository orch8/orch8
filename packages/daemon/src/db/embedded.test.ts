import { describe, it, expect, afterEach } from "vitest";
import { startEmbeddedPostgres, stopEmbeddedPostgres } from "./embedded.js";
import postgres from "postgres";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

describe("Embedded Postgres", () => {
  afterEach(async () => {
    await stopEmbeddedPostgres();
  });

  it("starts and returns a working connection string", async () => {
    const dataDir = path.join(os.tmpdir(), `orch8-test-${randomUUID()}`);
    const connectionString = await startEmbeddedPostgres({
      databaseDir: dataDir,
      port: 0,
      persistent: false,
    });

    expect(connectionString).toMatch(/^postgres:\/\//);

    // Verify we can connect and query
    const sql = postgres(connectionString, { max: 1 });
    const result = await sql`SELECT 1 as value`;
    expect(result[0].value).toBe(1);
    await sql.end();
  }, 60_000);

  it("creates the orchestrator database", async () => {
    const dataDir = path.join(os.tmpdir(), `orch8-test-${randomUUID()}`);
    const connectionString = await startEmbeddedPostgres({
      databaseDir: dataDir,
      port: 0,
      persistent: false,
    });

    // Connection string should target the orchestrator database
    expect(connectionString).toContain("/orchestrator");

    const sql = postgres(connectionString, { max: 1 });
    const result = await sql`SELECT current_database()`;
    expect(result[0].current_database).toBe("orchestrator");
    await sql.end();
  }, 60_000);

  it("stop is safe to call when not started", async () => {
    await expect(stopEmbeddedPostgres()).resolves.toBeUndefined();
  });
});
