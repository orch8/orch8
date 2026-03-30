// packages/daemon/src/types.ts
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@orch/shared/db";
import type { TaskLifecycleService } from "./services/task-lifecycle.service.js";
import type { AgentService } from "./services/agent.service.js";

export type SchemaDb = PostgresJsDatabase<typeof schema>;

declare module "fastify" {
  interface FastifyInstance {
    db: SchemaDb;
    lifecycleService: TaskLifecycleService;
    agentService: AgentService;
  }
  interface FastifyRequest {
    agent?: typeof schema.agents.$inferSelect;
    isAdmin?: boolean;
    projectId?: string;
    runId?: string;
  }
}
