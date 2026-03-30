import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@orch/shared/db";
import type { SchemaDb } from "../types.js";

export type { SchemaDb };

export interface DbClient {
  db: SchemaDb;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export function createDbClient(connectionString: string): DbClient {
  const sql = postgres(connectionString, {
    max: Number(process.env.ORCH_DB_POOL_MAX ?? 10),
    idle_timeout: 20,
  });

  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
    close: () => sql.end(),
  };
}
