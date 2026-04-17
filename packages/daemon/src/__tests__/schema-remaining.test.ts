import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  projects, tasks, heartbeatRuns,
  wakeupRequests, taskSessions,
  knowledgeEntities, knowledgeFacts,
  sharedDecisions, activityLog, mcpTools,
} from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";

describe("Remaining Schema Tables", () => {
  let testDb: TestDb;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Schema Test",
      slug: "schema-remaining-test",
      homeDir: "/tmp/schema-test",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  // ─── Wakeup Requests ─────────────────────────────────────

  describe("wakeupRequests", () => {
    it("creates a wakeup request with defaults", async () => {
      const [req] = await testDb.db.insert(wakeupRequests).values({
        agentId: "test-agent",
        projectId,
        source: "assignment",
        reason: "Task assigned",
      }).returning();

      expect(req.id).toMatch(/^wake_/);
      expect(req.status).toBe("queued");
      expect(req.coalescedCount).toBe(0);
      expect(req.source).toBe("assignment");
    });

    it("creates a wakeup request linked to a task and run", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Wakeup target",
      }).returning();

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "test-agent",
        projectId,
        invocationSource: "assignment",
      }).returning();

      const [req] = await testDb.db.insert(wakeupRequests).values({
        agentId: "test-agent",
        projectId,
        taskId: task.id,
        source: "assignment",
        runId: run.id,
        requestedByActorType: "user",
        requestedByActorId: "admin",
      }).returning();

      expect(req.taskId).toBe(task.id);
      expect(req.runId).toBe(run.id);
      expect(req.requestedByActorType).toBe("user");
    });

    it("supports all wakeup source values", async () => {
      for (const source of ["timer", "assignment", "on_demand", "automation"] as const) {
        const [req] = await testDb.db.insert(wakeupRequests).values({
          agentId: "test-agent",
          projectId,
          source,
        }).returning();
        expect(req.source).toBe(source);
      }
    });

    it("supports all wakeup status values", async () => {
      const statuses = [
        "queued", "claimed", "coalesced",
        "deferred_issue_execution", "skipped", "budget_blocked",
      ] as const;

      for (const status of statuses) {
        const [req] = await testDb.db.insert(wakeupRequests).values({
          agentId: "test-agent",
          projectId,
          source: "timer",
          status,
        }).returning();
        expect(req.status).toBe(status);
      }
    });
  });

  // ─── Task Sessions ────────────────────────────────────────

  describe("taskSessions", () => {
    it("creates a task session with defaults", async () => {
      const [session] = await testDb.db.insert(taskSessions).values({
        agentId: "agent-a",
        projectId,
        taskKey: "task_123",
        adapterType: "claude_local",
      }).returning();

      expect(session.id).toMatch(/^sess_/);
      expect(session.taskKey).toBe("task_123");
      expect(session.sessionParamsJson).toBeNull();
    });

    it("creates a session with params and display ID", async () => {
      const [session] = await testDb.db.insert(taskSessions).values({
        agentId: "agent-b",
        projectId,
        taskKey: "task_456",
        adapterType: "claude_local",
        sessionParamsJson: { resumeId: "abc" },
        sessionDisplayId: "session-display-1",
      }).returning();

      expect(session.sessionParamsJson).toEqual({ resumeId: "abc" });
      expect(session.sessionDisplayId).toBe("session-display-1");
    });

    it("enforces unique constraint on (agentId, taskKey, adapterType)", async () => {
      await testDb.db.insert(taskSessions).values({
        agentId: "agent-uniq",
        projectId,
        taskKey: "task_uniq",
        adapterType: "claude_local",
      });

      await expect(
        testDb.db.insert(taskSessions).values({
          agentId: "agent-uniq",
          projectId,
          taskKey: "task_uniq",
          adapterType: "claude_local",
        })
      ).rejects.toThrow();
    });

    it("allows same agent+task with different adapter type", async () => {
      await testDb.db.insert(taskSessions).values({
        agentId: "agent-multi",
        projectId,
        taskKey: "task_multi",
        adapterType: "claude_local",
      });

      const [session2] = await testDb.db.insert(taskSessions).values({
        agentId: "agent-multi",
        projectId,
        taskKey: "task_multi",
        adapterType: "openai_remote",
      }).returning();

      expect(session2.adapterType).toBe("openai_remote");
    });
  });

  // ─── Knowledge Entities ───────────────────────────────────

  describe("knowledgeEntities", () => {
    it("creates an entity with defaults", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "auth-system",
        name: "Auth System",
      }).returning();

      expect(entity.id).toMatch(/^ent_/);
      expect(entity.entityType).toBe("area");
      expect(entity.description).toBe("");
    });

    it("supports all entity type values", async () => {
      for (const entityType of ["project", "area", "archive"] as const) {
        const [entity] = await testDb.db.insert(knowledgeEntities).values({
          projectId,
          slug: `type-test-${entityType}`,
          name: `Type ${entityType}`,
          entityType,
        }).returning();
        expect(entity.entityType).toBe(entityType);
      }
    });

    it("enforces unique (projectId, slug)", async () => {
      await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "duplicate-slug",
        name: "First",
      });

      await expect(
        testDb.db.insert(knowledgeEntities).values({
          projectId,
          slug: "duplicate-slug",
          name: "Second",
        })
      ).rejects.toThrow();
    });
  });

  // ─── Knowledge Facts ──────────────────────────────────────

  describe("knowledgeFacts", () => {
    it("creates a fact linked to an entity", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "facts-test-entity",
        name: "Facts Entity",
      }).returning();

      const [fact] = await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "We use JWT for auth",
        category: "decision",
        sourceAgent: "cto",
      }).returning();

      expect(fact.id).toMatch(/^fact_/);
      expect(fact.accessCount).toBe(0);
      expect(fact.supersededBy).toBeNull();
      expect(fact.lastAccessed).toBeNull();
    });

    it("creates a fact linked to a source task", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "facts-task-entity",
        name: "Facts Task Entity",
      }).returning();

      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Research auth",
      }).returning();

      const [fact] = await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "OAuth2 preferred",
        category: "convention",
        sourceAgent: "researcher",
        sourceTask: task.id,
      }).returning();

      expect(fact.sourceTask).toBe(task.id);
    });

    it("cascades delete when entity is removed", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId,
        slug: "cascade-test-entity",
        name: "Cascade Entity",
      }).returning();

      await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id,
        content: "Will be deleted",
        category: "observation",
        sourceAgent: "engineer",
      });

      await testDb.db.delete(knowledgeEntities).where(eq(knowledgeEntities.id, entity.id));

      const remaining = await testDb.db
        .select()
        .from(knowledgeFacts)
        .where(eq(knowledgeFacts.entityId, entity.id));
      expect(remaining).toHaveLength(0);
    });
  });

  // ─── Shared Decisions ─────────────────────────────────────

  describe("sharedDecisions", () => {
    it("creates a binding decision", async () => {
      const [dec] = await testDb.db.insert(sharedDecisions).values({
        projectId,
        title: "Use PostgreSQL",
        decision: "All persistent data goes into Postgres",
        madeBy: "cto",
      }).returning();

      expect(dec.id).toMatch(/^dec_/);
      expect(dec.binding).toBe(true);
      expect(dec.context).toBe("");
    });

    it("creates a non-binding decision with context", async () => {
      const [dec] = await testDb.db.insert(sharedDecisions).values({
        projectId,
        title: "Prefer Fastify",
        decision: "Use Fastify over Express for new services",
        madeBy: "engineer",
        context: "Performance benchmarks showed 2x throughput",
        binding: false,
      }).returning();

      expect(dec.binding).toBe(false);
      expect(dec.context).toBe("Performance benchmarks showed 2x throughput");
    });
  });

  // ─── Activity Log ─────────────────────────────────────────

  describe("activityLog", () => {
    it("creates a log entry with auto-generated ID", async () => {
      const [entry] = await testDb.db.insert(activityLog).values({
        projectId,
        message: "Agent started",
      }).returning();

      expect(typeof entry.id).toBe("number");
      expect(entry.level).toBe("info");
      expect(entry.agentId).toBeNull();
    });

    it("creates a log entry linked to agent, task, and run", async () => {
      const [task] = await testDb.db.insert(tasks).values({
        projectId,
        title: "Log target task",
      }).returning();

      const [run] = await testDb.db.insert(heartbeatRuns).values({
        agentId: "log-agent",
        projectId,
        invocationSource: "timer",
      }).returning();

      const [entry] = await testDb.db.insert(activityLog).values({
        projectId,
        agentId: "log-agent",
        taskId: task.id,
        runId: run.id,
        message: "Task picked up",
        level: "info",
      }).returning();

      expect(entry.agentId).toBe("log-agent");
      expect(entry.taskId).toBe(task.id);
      expect(entry.runId).toBe(run.id);
    });

    it("supports all log levels", async () => {
      for (const level of ["info", "warn", "error"] as const) {
        const [entry] = await testDb.db.insert(activityLog).values({
          projectId,
          message: `Level ${level}`,
          level,
        }).returning();
        expect(entry.level).toBe(level);
      }
    });

    it("auto-increments IDs", async () => {
      const [a] = await testDb.db.insert(activityLog).values({
        projectId,
        message: "First",
      }).returning();

      const [b] = await testDb.db.insert(activityLog).values({
        projectId,
        message: "Second",
      }).returning();

      expect(b.id).toBeGreaterThan(a.id);
    });
  });

  // ─── MCP Tools ────────────────────────────────────────────

  describe("mcpTools", () => {
    it("creates an MCP tool with required fields", async () => {
      const [tool] = await testDb.db.insert(mcpTools).values({
        id: "mcp-filesystem",
        name: "Filesystem",
        serverCommand: "npx",
        serverArgs: ["-y", "@modelcontextprotocol/server-filesystem"],
      }).returning();

      expect(tool.id).toBe("mcp-filesystem");
      expect(tool.name).toBe("Filesystem");
      expect(tool.description).toBe("");
      expect(tool.serverArgs).toEqual(["-y", "@modelcontextprotocol/server-filesystem"]);
    });

    it("creates an MCP tool with env vars", async () => {
      const [tool] = await testDb.db.insert(mcpTools).values({
        id: "mcp-github",
        name: "GitHub",
        description: "GitHub API access",
        serverCommand: "npx",
        serverArgs: ["-y", "@modelcontextprotocol/server-github"],
        envVars: { GITHUB_TOKEN: "from-env" },
      }).returning();

      expect(tool.envVars).toEqual({ GITHUB_TOKEN: "from-env" });
    });

    it("rejects duplicate IDs", async () => {
      await testDb.db.insert(mcpTools).values({
        id: "mcp-dup",
        name: "Dup",
        serverCommand: "echo",
      });

      await expect(
        testDb.db.insert(mcpTools).values({
          id: "mcp-dup",
          name: "Dup 2",
          serverCommand: "echo",
        })
      ).rejects.toThrow();
    });
  });
});
