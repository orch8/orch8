import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { agentRoutes } from "../api/routes/agents.js";
import { AgentService } from "../services/agent.service.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import "../types.js";

describe("Agent Clone", () => {
  let testDb: TestDb;
  let agentService: AgentService;
  let sourceProjectId: string;
  let targetProjectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);
    agentService = new AgentService(testDb.db);

    const [srcProj] = await testDb.db
      .insert(projects)
      .values({
        name: "Source",
        slug: "source",
        homeDir: "/tmp/src",
        worktreeDir: "/tmp/src-wt",
      })
      .returning();
    sourceProjectId = srcProj.id;

    const [tgtProj] = await testDb.db
      .insert(projects)
      .values({
        name: "Target",
        slug: "target",
        homeDir: "/tmp/tgt",
        worktreeDir: "/tmp/tgt-wt",
      })
      .returning();
    targetProjectId = tgtProj.id;
  });

  describe("AgentService.clone", () => {
    it("clones agent definition to another project", async () => {
      await agentService.create({
        id: "eng-alpha",
        projectId: sourceProjectId,
        name: "Alpha Engineer",
        role: "engineer",
        model: "claude-sonnet-4-6",
        maxTurns: 30,
      });

      const cloned = await agentService.clone(
        "eng-alpha",
        sourceProjectId,
        { targetProjectId, newId: "eng-beta" },
      );

      expect(cloned.id).toBe("eng-beta");
      expect(cloned.projectId).toBe(targetProjectId);
      expect(cloned.name).toBe("Alpha Engineer");
      expect(cloned.role).toBe("engineer");
      expect(cloned.model).toBe("claude-sonnet-4-6");
      // Fresh agent state
      expect(cloned.status).toBe("active");
      expect(cloned.budgetSpentUsd).toBe(0);
    });

    it("clones to same project with different ID", async () => {
      await agentService.create({
        id: "eng-1",
        projectId: sourceProjectId,
        name: "Engineer",
        role: "engineer",
      });

      const cloned = await agentService.clone(
        "eng-1",
        sourceProjectId,
        { targetProjectId: sourceProjectId, newId: "eng-2" },
      );

      expect(cloned.id).toBe("eng-2");
      expect(cloned.projectId).toBe(sourceProjectId);
    });

    it("throws if source agent not found", async () => {
      await expect(
        agentService.clone("nope", sourceProjectId, {
          targetProjectId,
          newId: "eng-x",
        }),
      ).rejects.toThrow("Agent not found");
    });
  });

  describe("POST /api/agents/:id/clone", () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      await testDb.db.delete(agents);
      await testDb.db.delete(projects);

      const [srcProj] = await testDb.db
        .insert(projects)
        .values({
          name: "Source",
          slug: "source-r",
          homeDir: "/tmp/src-r",
          worktreeDir: "/tmp/src-r-wt",
        })
        .returning();
      sourceProjectId = srcProj.id;

      const [tgtProj] = await testDb.db
        .insert(projects)
        .values({
          name: "Target",
          slug: "target-r",
          homeDir: "/tmp/tgt-r",
          worktreeDir: "/tmp/tgt-r-wt",
        })
        .returning();
      targetProjectId = tgtProj.id;

      app = Fastify();
      app.decorate("db", testDb.db);
      const as = new AgentService(testDb.db);
      app.decorate("agentService", as);

      // HeartbeatService stub for wake route
      const sockets = new Set() as unknown as Set<import("ws").WebSocket>;
      const broadcastService = new BroadcastService(sockets);
      const hs = new HeartbeatService(testDb.db, broadcastService);
      app.decorate("heartbeatService", hs);

      app.register(authPlugin, { allowLocalhostAdmin: true });
      app.register(agentRoutes);
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it("clones agent to target project (admin)", async () => {
      await testDb.db.insert(agents).values({
        id: "eng-src",
        projectId: sourceProjectId,
        name: "Source Engineer",
        role: "engineer",
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/agents/eng-src/clone`,
        headers: { "x-project-id": sourceProjectId },
        payload: {
          targetProjectId,
          newId: "eng-cloned",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe("eng-cloned");
      expect(body.projectId).toBe(targetProjectId);
    });

    it("returns 404 for nonexistent agent", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/agents/nope/clone`,
        headers: { "x-project-id": sourceProjectId },
        payload: {
          targetProjectId,
          newId: "eng-x",
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 409 for duplicate agent ID in target", async () => {
      await testDb.db.insert(agents).values([
        {
          id: "eng-dup",
          projectId: sourceProjectId,
          name: "Source",
          role: "engineer",
        },
        {
          id: "eng-existing",
          projectId: targetProjectId,
          name: "Existing",
          role: "engineer",
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: `/api/agents/eng-dup/clone`,
        headers: { "x-project-id": sourceProjectId },
        payload: {
          targetProjectId,
          newId: "eng-existing",
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 400 for missing fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/agents/eng-src/clone`,
        headers: { "x-project-id": sourceProjectId },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
