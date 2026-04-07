import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Writable, Readable } from "node:stream";
import { projects, agents, pipelineTemplates, pipelines, pipelineSteps, tasks } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { buildServer } from "../server.js";

function createMockProcess() {
  const stdin = new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  });
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdin, stdout, stderr, pid: 55555,
    kill: vi.fn(() => { proc.emit("close", 0, null); return true; }),
  });
  return proc;
}

describe("Pipeline API routes", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof buildServer>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    app = buildServer({
      databaseUrl: testDb.connectionUri,
      spawnFn: vi.fn(() => createMockProcess()) as unknown as typeof import("node:child_process").spawn,
    });
    await app.ready();

    const [project] = await testDb.db.insert(projects).values({
      name: "Route Test",
      slug: "route-test",
      homeDir: "/tmp/route",
      worktreeDir: "/tmp/route-wt",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "route-agent-a",
      projectId,
      name: "Agent A",
      role: "engineer",
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(tasks);
    await testDb.db.delete(pipelineSteps);
    await testDb.db.delete(pipelines);
    await testDb.db.delete(pipelineTemplates);
  });

  describe("Pipeline Templates", () => {
    it("POST /api/pipeline-templates creates template", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/pipeline-templates",
        payload: {
          projectId,
          name: "Standard",
          steps: [
            { order: 1, label: "research" },
            { order: 2, label: "implement" },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toMatch(/^ptpl_/);
      expect(body.name).toBe("Standard");
    });

    it("GET /api/pipeline-templates lists templates", async () => {
      await app.inject({
        method: "POST",
        url: "/api/pipeline-templates",
        payload: { projectId, name: "A", steps: [{ order: 1, label: "a" }] },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/pipeline-templates?projectId=${projectId}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });
  });

  describe("Pipelines", () => {
    it("POST /api/pipelines creates pipeline with steps", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Auth system",
          steps: [
            { label: "research", agentId: "route-agent-a" },
            { label: "implement", agentId: "route-agent-a" },
          ],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.pipeline.id).toMatch(/^pipe_/);
      expect(body.steps).toHaveLength(2);
      expect(body.steps[0].taskId).not.toBeNull();
    });

    it("GET /api/pipelines/:id returns pipeline with steps", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Fetch test",
          steps: [{ label: "work", agentId: "route-agent-a" }],
        },
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "GET",
        url: `/api/pipelines/${created.pipeline.id}`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pipeline.name).toBe("Fetch test");
    });

    it("POST /api/pipelines/:id/cancel cancels pipeline", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Cancel test",
          steps: [{ label: "work", agentId: "route-agent-a" }],
        },
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "POST",
        url: `/api/pipelines/${created.pipeline.id}/cancel`,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("cancelled");
    });

    it("PATCH /api/pipelines/:id/steps/:stepId updates step", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Step update test",
          steps: [
            { label: "a", agentId: "route-agent-a" },
            { label: "b", agentId: "route-agent-a" },
          ],
        },
      });
      const created = createRes.json();
      const secondStep = created.steps[1];

      const res = await app.inject({
        method: "PATCH",
        url: `/api/pipelines/${created.pipeline.id}/steps/${secondStep.id}`,
        payload: { status: "skipped" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("skipped");
    });

    it("POST /api/pipelines/:id/steps/:stepId/approve approves a verification step", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Approve route test",
          steps: [
            { label: "plan", agentId: "route-agent-a", requiresVerification: true },
            { label: "implement", agentId: "route-agent-a" },
          ],
        },
      });
      const created = createRes.json();
      const planStep = created.steps[0];

      // Complete the step (agent finishes work) — will pause at awaiting_verification
      // We need to complete via the task route, but for simplicity we'll use the service directly
      await app.pipelineService.completeStep(
        created.pipeline.id,
        planStep.id,
        "Plan output",
        ".orch8/pipelines/test/plan.md",
      );

      const res = await app.inject({
        method: "POST",
        url: `/api/pipelines/${created.pipeline.id}/steps/${planStep.id}/approve`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.approvedStep.status).toBe("completed");
      expect(body.nextStep).not.toBeNull();
      expect(body.nextTask).not.toBeNull();
      expect(body.pipeline.currentStep).toBe(2);
    });

    it("POST /api/pipelines/:id/steps/:stepId/approve returns 400 for non-verification step", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/pipelines",
        payload: {
          projectId,
          name: "Bad approve route",
          steps: [{ label: "work", agentId: "route-agent-a" }],
        },
      });
      const created = createRes.json();

      const res = await app.inject({
        method: "POST",
        url: `/api/pipelines/${created.pipeline.id}/steps/${created.steps[0].id}/approve`,
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
