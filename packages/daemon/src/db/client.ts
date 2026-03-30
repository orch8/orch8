import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export interface DbClient {
  db: PostgresJsDatabase;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export function createDbClient(connectionString: string): DbClient {
  const sql = postgres(connectionString, {
    max: Number(process.env.ORCH_DB_POOL_MAX ?? 10),
    idle_timeout: 20,
  });

  const db = drizzle(sql);

  return {
    db,
    sql,
    close: () => sql.end(),
  };
}
