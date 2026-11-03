import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agents, chats, chatMessages, tasks, heartbeatRuns, pipelineTemplates } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { ProjectService } from "../services/project.service.js";
import { SeedingService } from "../services/seeding.service.js";
import { SchedulerService } from "../services/scheduler.service.js";
import { buildServer } from "../server.js";

let testDb: TestDb;
let home: string;
beforeEach(async () => {
  testDb = await setupTestDb();
  home = await mkdtemp(join(tmpdir(), "factory-defaults-"));
  // Do not copy bundled skills into the operator's global home or start timers.
  vi.spyOn(SeedingService.prototype, "populateGlobalSkills").mockResolvedValue(undefined);
  vi.spyOn(SchedulerService.prototype, "start").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await teardownTestDb(testDb);
  await rm(home, { recursive: true, force: true });
});

async function assertIdleDefaults() {
  expect(await testDb.db.select().from(chats)).toEqual([]);
  expect((await testDb.db.select().from(agents)).map(a => a.id)).toEqual(["chat"]);
  expect(await testDb.db.select().from(tasks)).toEqual([]);
  expect(await testDb.db.select().from(heartbeatRuns)).toEqual([]);
  const templates = await testDb.db.select().from(pipelineTemplates);
  expect(templates).toHaveLength(1);
  expect(templates[0]).toMatchObject({ name: "Standard Dev Flow", isDefault: true });
  expect(templates[0].steps.map(s => s.label)).toEqual(["research", "plan", "implement", "review"]);
}

describe("factory defaults", () => {
  it("creates the compatibility chat agent but no conversation or work", async () => {
    await new ProjectService(testDb.db).create({ name: "Factory", slug: "factory", homeDir: home });
    await assertIdleDefaults();
  });

  it("does not backfill an empty project's conversations across two startups", async () => {
    await new ProjectService(testDb.db).create({ name: "Factory", slug: "factory", homeDir: home });
    // Also represents a pre-existing project that has never used Chat.
    await testDb.db.delete(chats);
    const spawnFn = vi.fn(() => { throw new Error("Provider execution forbidden in fixture"); });
    for (let restart = 0; restart < 2; restart++) {
      const app = buildServer({ databaseUrl: testDb.connectionUri, spawnFn });
      try {
        await app.initPromise;
        await assertIdleDefaults();
        expect(spawnFn).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    }
  });
  it("preserves legacy history and explicitly installed CTO/QA across startup", async () => {
    const spawnFn = vi.fn(() => { throw new Error("Provider execution forbidden in fixture"); });
    let app = buildServer({ databaseUrl: testDb.connectionUri, spawnFn, adminToken: "fixture-token" });
    const headers = { authorization: "Bearer fixture-token" };
    let beforeAgents;
    let beforeChats;
    let beforeMessages;
    let entity;
    try {
      await app.initPromise;
      const project = await app.projectService.create({ name: "Legacy", slug: "legacy", homeDir: home });
      const catalog = await app.inject({ url: "/api/bundled-agents", headers });
      expect(catalog.json().map((a: { id: string }) => a.id)).toEqual(expect.arrayContaining(["cto", "qa", "implementer", "reviewer"]));
      const added = await app.inject({ method: "POST", url: "/api/bundled-agents/add", headers,
        payload: { projectId: project.id, agentIds: ["cto", "qa"] } });
      expect(added.statusCode).toBe(201);
      beforeAgents = added.json();
      expect(beforeAgents).toHaveLength(2);
      expect(beforeAgents.every((a: { heartbeatEnabled: boolean }) => a.heartbeatEnabled)).toBe(true);
      await app.seedingService.ensureInitialChat(testDb.db, project.id);
      beforeChats = await testDb.db.select().from(chats);
      await testDb.db.insert(chatMessages).values({ chatId: beforeChats[0].id, role: "user", content: "Keep this legacy discussion" });
      beforeMessages = await testDb.db.select().from(chatMessages);
      entity = await app.memoryService.createEntity({ projectId: project.id, slug: "legacy-memory", name: "Legacy memory", entityType: "project", description: "Keep this memory" });
    } finally { await app.close(); }
    for (let restart = 0; restart < 2; restart++) {
      app = buildServer({ databaseUrl: testDb.connectionUri, spawnFn, adminToken: "fixture-token" });
      try {
        await app.initPromise;
        expect(await testDb.db.select().from(chats)).toEqual(beforeChats);
        expect(await testDb.db.select().from(chatMessages)).toEqual(beforeMessages);
        expect(await app.memoryService.getEntity(entity!.id)).toEqual(entity);
        for (const before of beforeAgents) {
          const after = (await testDb.db.select().from(agents)).find(a => a.id === before.id)!;
          expect(after).toMatchObject({ id: before.id, heartbeatEnabled: before.heartbeatEnabled, heartbeatIntervalSec: before.heartbeatIntervalSec });
        }
        const history = await app.inject({ url: `/api/chats/${beforeChats![0].id}/messages`, headers });
        expect(history.statusCode).toBe(200);
        expect(JSON.stringify(history.json())).toContain("Keep this legacy discussion");
        expect(spawnFn).not.toHaveBeenCalled();
      } finally { await app.close(); }
    }
  });

});
