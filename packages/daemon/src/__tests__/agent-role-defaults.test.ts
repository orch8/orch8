import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { agentRoutes } from "../api/routes/agents.js";
import { AgentService } from "../services/agent.service.js";
import "../types.js";

describe("Agent Role Defaults (Integration)", () => {
  let testDb: TestDb;
  let projectId: string;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Role Defaults",
      slug: "role-defaults",
      homeDir: "/tmp/role-defaults",
      worktreeDir: "/tmp/role-defaults-wt",
    }).returning();
    projectId = project.id;
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(agents);

    app = Fastify();
    app.decorate("db", testDb.db);
    app.decorate("agentService", new AgentService(testDb.db));
    app.register(authPlugin);
    app.register(agentRoutes);
    await app.ready();
  });

  it("CTO gets opus model, heartbeat enabled, task creation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { "x-project-id": projectId },
      payload: { id: "cto", projectId, name: "CTO", role: "cto" },
    });

    const body = JSON.parse(response.body);
    expect(body.model).toBe("claude-opus-4-6");
    expect(body.heartbeatEnabled).toBe(true);
    expect(body.heartbeatIntervalSec).toBe(3600);
    expect(body.canCreateTasks).toBe(true);
    expect(body.maxTurns).toBe(50);

    await app.close();
  });

  it("Engineer gets sonnet model, no heartbeat, wake on assignment", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { "x-project-id": projectId },
      payload: { id: "eng", projectId, name: "Engineer", role: "engineer" },
    });

    const body = JSON.parse(response.body);
    expect(body.model).toBe("claude-opus-4-6");
    expect(body.heartbeatEnabled).toBe(false);
    expect(body.wakeOnAssignment).toBe(true);

    await app.close();
  });

  it("QA gets heartbeat enabled", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { "x-project-id": projectId },
      payload: { id: "qa", projectId, name: "QA", role: "qa" },
    });

    const body = JSON.parse(response.body);
    expect(body.heartbeatEnabled).toBe(true);
    expect(body.heartbeatIntervalSec).toBe(3600);

    await app.close();
  });

  it("Referee gets opus model for authoritative judgment", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { "x-project-id": projectId },
      payload: { id: "ref", projectId, name: "Referee", role: "referee" },
    });

    const body = JSON.parse(response.body);
    expect(body.model).toBe("claude-opus-4-6");
    expect(body.wakeOnAutomation).toBe(true);

    await app.close();
  });

  it("explicit values override role defaults", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: { "x-project-id": projectId },
      payload: {
        id: "custom-eng",
        projectId,
        name: "Custom Engineer",
        role: "engineer",
        model: "claude-opus-4-6",
        maxTurns: 100,
        heartbeatEnabled: true,
        heartbeatIntervalSec: 300,
      },
    });

    const body = JSON.parse(response.body);
    expect(body.model).toBe("claude-opus-4-6");
    expect(body.maxTurns).toBe(100);
    expect(body.heartbeatEnabled).toBe(true);
    expect(body.heartbeatIntervalSec).toBe(300);

    await app.close();
  });
});
