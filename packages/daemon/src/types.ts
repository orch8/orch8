import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@orch/shared/db";

export type SchemaDb = PostgresJsDatabase<typeof schema>;

declare module "fastify" {
  interface FastifyInstance {
    db: SchemaDb;
  }
  interface FastifyRequest {
    agent?: typeof schema.agents.$inferSelect;
    isAdmin?: boolean;
    projectId?: string;
    runId?: string;
  }
}
