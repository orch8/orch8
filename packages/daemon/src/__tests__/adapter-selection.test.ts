import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { eq } from "drizzle-orm";
import { agents, heartbeatRuns, projects } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { useAsyncWork } from "./helpers/async-work.js";
import { HeartbeatService } from "../services/heartbeat.service.js";
import { ChatService } from "../services/chat.service.js";
import { BroadcastService } from "../services/broadcast.service.js";
import { SessionManager } from "../adapter/session-manager.js";
import { adapterTestRoutes } from "../api/routes/adapter-test.js";

function makeAdapters() {
  const make = (type: "claude_local" | "codex_local") => ({
    type,
    capabilities: { requiresMaterializedRuntimeSkills: false, supportsInstructionsBundle: true },
    runAgent: vi.fn(async () => ({
      sessionId: null, model: null, result: "ok", usage: null, costUsd: null,
      billingType: "api" as const, exitCode: 0, signal: null, error: null, errorCode: null, events: [],
    })),
    testEnvironment: vi.fn(async (): Promise<{ ok: boolean; costUsd?: number }> => ({ ok: true })),
  });
  return { claude_local: make("claude_local"), codex_local: make("codex_local") };
}

describe("adapter selection at execution boundaries", () => {
  let db: TestDb;
  let projectId: string;
  const work = useAsyncWork(ChatService.prototype, "runAssistantTurn");
  beforeAll(async () => {
    db = await setupTestDb();
    const [project] = await db.db.insert(projects).values({ name: "Adapters", slug: "adapters", homeDir: "/tmp/orch8-adapter-selection-test" }).returning();
    projectId = project.id;
  }, 60_000);
  afterAll(async () => { await teardownTestDb(db); });

  for (const adapterType of ["unsupported_provider", "", "claude_local", "codex_local", undefined]) {
    const supported = adapterType === undefined || adapterType === "claude_local" || adapterType === "codex_local";
    const selected = adapterType === "codex_local" ? "codex_local" : "claude_local";
    it(`heartbeat ${JSON.stringify(adapterType)} ${supported ? "runs selected adapter" : "fails without execution"}`, async () => {
      const id = `heartbeat-${adapterType ?? "default"}`;
      await db.db.insert(agents).values({ id, projectId, name: id, role: "engineer", adapterType });
      const [run] = await db.db.insert(heartbeatRuns).values({ agentId: id, projectId, invocationSource: "on_demand", status: "queued" }).returning();
      const map = makeAdapters();
      const service = new HeartbeatService(db.db, new BroadcastService(new Set()));
      service.setAdapters(map);
      try {
        await service.executeRun(run.id);
        const [finished] = await db.db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, run.id));
        if (supported) {
          expect(finished.status).toBe("succeeded");
          expect(map[selected].runAgent).toHaveBeenCalledTimes(1);
          expect(map[selected === "claude_local" ? "codex_local" : "claude_local"].runAgent).not.toHaveBeenCalled();
        } else {
          expect(finished.status).toBe("failed");
          expect(finished.error).toContain("Unsupported adapter type");
          expect(map.claude_local.runAgent).not.toHaveBeenCalled();
          expect(map.codex_local.runAgent).not.toHaveBeenCalled();
        }
      } finally { service.shutdown(); }
    });

    it(`chat ${JSON.stringify(adapterType)} ${supported ? "runs selected adapter" : "reports selection error without execution"}`, async () => {
      const id = `chat-${adapterType ?? "default"}`;
      await db.db.insert(agents).values({ id, projectId, name: id, role: "custom", adapterType });
      const map = makeAdapters();
      const broadcast = new BroadcastService(new Set());
      const error = vi.spyOn(broadcast, "chatMessageError");
      const service = new ChatService(db.db, map, new SessionManager(db.db), broadcast, "http://localhost:3847");
      const chat = await service.createChat({ projectId, agentId: id });
      await service.sendUserMessage(chat.id, "hello");
      await work.drain();
      if (supported) {
        expect(error).not.toHaveBeenCalled();
        expect(map[selected].runAgent).toHaveBeenCalledTimes(1);
        expect(map[selected === "claude_local" ? "codex_local" : "claude_local"].runAgent).not.toHaveBeenCalled();
        expect((await service.listMessages(chat.id))[1].status).toBe("complete");
      } else {
        expect(error).toHaveBeenCalledWith(projectId, expect.objectContaining({ error: expect.stringContaining("Unsupported adapter type") }));
        expect(map.claude_local.runAgent).not.toHaveBeenCalled();
        expect(map.codex_local.runAgent).not.toHaveBeenCalled();
      }
    });
  }
});

describe("adapter environment route", () => {
  it.each(["unknown", "constructor", "claude_local", "codex_local"])("validates %s before environment probe", async (type) => {
    const app = Fastify();
    const map = makeAdapters();
    app.decorate("adapters", map);
    await app.register(adapterTestRoutes);
    try {
      const response = await app.inject({ method: "POST", url: `/api/adapter/${type}/test-environment`, payload: {} });
      const supported = type === "codex_local";
      expect(response.statusCode).toBe(supported ? 200 : type === "claude_local" ? 403 : 400);
      if (supported) expect(map.codex_local.testEnvironment).toHaveBeenCalledTimes(1);
      else {
        expect(response.json().error).toBe(type === "claude_local" ? "forbidden" : "validation_error");
        expect(map.claude_local.testEnvironment).not.toHaveBeenCalled();
        expect(map.codex_local.testEnvironment).not.toHaveBeenCalled();
      }
    } finally { await app.close(); }
  });
  it("binds Claude probe to the selected admin project and rejects caller paths and bypass flags", async () => {
    const testDb = await setupTestDb();
    const [project] = await testDb.db.insert(projects).values({ name: "Selected", slug: "selected-probe", homeDir: "/repo/selected", budgetLimitUsd: 1 }).returning();
    const app = Fastify();
    const map = makeAdapters();
    app.decorate("adapters", map);
    app.decorate("db", testDb.db);
    app.decorate("projectService", { getById: vi.fn(async (id: string) => id === project.id ? (await testDb.db.select().from(projects).where(eq(projects.id, id)))[0] : null) } as never);
    app.addHook("onRequest", async request => { request.isAdmin = true; });
    await app.register(adapterTestRoutes);
    try {
      for (const config of [{ cwd: "/repo/other" }, { dangerouslySkipPermissions: true }, { extraArgs: ["--allowedTools", "Bash"] }]) {
        const response = await app.inject({ method: "POST", url: "/api/adapter/claude_local/test-environment", payload: { projectId: project.id, config } });
        expect(response.statusCode).toBe(400);
      }
      expect(map.claude_local.testEnvironment).not.toHaveBeenCalled();
      const missing = await app.inject({ method: "POST", url: "/api/adapter/claude_local/test-environment", payload: { projectId: "unknown", config: {} } });
      expect(missing.statusCode).toBe(404);
      map.claude_local.testEnvironment.mockResolvedValueOnce({ ok: false, costUsd: 0.25 });
      const allowed = await app.inject({ method: "POST", url: "/api/adapter/claude_local/test-environment", payload: { projectId: project.id, config: { dangerouslySkipPermissions: false } } });
      expect(allowed.statusCode).toBe(200);
      expect(map.claude_local.testEnvironment).toHaveBeenCalledWith({ dangerouslySkipPermissions: false, cwd: "/repo/selected" });
      expect((await testDb.db.select().from(projects).where(eq(projects.id, project.id)))[0].budgetSpentUsd).toBe(0.25);
      await testDb.db.update(projects).set({ budgetPaused: true }).where(eq(projects.id, project.id));
      const blocked = await app.inject({ method: "POST", url: "/api/adapter/claude_local/test-environment", payload: { projectId: project.id, config: {} } });
      expect(blocked.statusCode).toBe(403);
      expect(map.claude_local.testEnvironment).toHaveBeenCalledTimes(1);
    } finally { await app.close(); await teardownTestDb(testDb); }
  });
});
