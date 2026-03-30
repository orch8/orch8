import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDbClient, type DbClient } from "../db/client.js";

describe("Database Client", () => {
  let container: StartedPostgreSqlContainer;
  let db: DbClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:17")
      .withDatabase("orchestrator_test")
      .start();

    db = createDbClient(container.getConnectionUri());
  }, 60_000);

  afterAll(async () => {
    await db.close();
    await container.stop();
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
