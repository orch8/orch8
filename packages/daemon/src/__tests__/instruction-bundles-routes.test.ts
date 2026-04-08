import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { projects, agents, instructionBundles } from "@orch/shared/db";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import Fastify from "fastify";
import { authPlugin } from "../api/middleware/auth.js";
import { instructionBundleRoutes } from "../api/routes/instruction-bundles.js";
import { InstructionBundleService } from "../services/instruction-bundle.service.js";

describe("instruction-bundles routes", () => {
  let testDb: TestDb;
  let projectId: string;
  let tempDir: string;
  let app: ReturnType<typeof Fastify>;
  let bundleService: InstructionBundleService;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(instructionBundles);
    await testDb.db.delete(agents);
    await testDb.db.delete(projects);

    tempDir = await mkdtemp(join(tmpdir(), "orch-bundle-route-"));

    const [proj] = await testDb.db.insert(projects).values({
      name: "Test",
      slug: "test",
      homeDir: tempDir,
      worktreeDir: join(tempDir, "worktrees"),
    }).returning();
    projectId = proj.id;

    await testDb.db.insert(agents).values({
      id: "agent-1",
      projectId,
      name: "Test Agent",
      role: "engineer",
      status: "active",
      model: "opus",
      maxTurns: 10,
      maxConcurrentRuns: 1,
      heartbeatEnabled: false,
      heartbeatIntervalSec: 60,
      wakeOnAssignment: true,
      wakeOnOnDemand: true,
      wakeOnAutomation: false,
      budgetSpentUsd: 0,
    });

    app = Fastify();
    bundleService = new InstructionBundleService(testDb.db, tempDir);
    app.decorate("db", testDb.db);
    app.decorate("instructionBundleService", bundleService);
    app.register(authPlugin);
    app.register(instructionBundleRoutes);
    await app.ready();

    await bundleService.ensure("agent-1", projectId, "engineer");
  });

  afterEach(async () => {
    await app.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("GET /api/agents/:id/instructions returns bundle after ensure", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents/agent-1/instructions",
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().mode).toBe("managed");
  });

  it("GET /api/agents/:id/instructions/files lists files", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents/agent-1/instructions/files",
      headers: { "x-project-id": projectId },
    });

    expect(res.statusCode).toBe(200);
    const files = res.json();
    expect(files.some((f: any) => f.path === "AGENTS.md")).toBe(true);
  });

  it("PUT + GET /api/agents/:id/instructions/files/:path round-trips", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/agents/agent-1/instructions/files/SOUL.md",
      headers: { "x-project-id": projectId },
      payload: { content: "# Soul\nBe creative." },
    });
    expect(putRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: "/api/agents/agent-1/instructions/files/SOUL.md",
      headers: { "x-project-id": projectId },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().content).toBe("# Soul\nBe creative.");
  });

  it("DELETE /api/agents/:id/instructions/files/:path removes file", async () => {
    await bundleService.writeFile("agent-1", projectId, "extra.md", "Extra");

    const res = await app.inject({
      method: "DELETE",
      url: "/api/agents/agent-1/instructions/files/extra.md",
      headers: { "x-project-id": projectId },
    });
    expect(res.statusCode).toBe(204);
  });

  it("PATCH /api/agents/:id/instructions updates mode", async () => {
    const validRoot = join(homedir(), ".orch8", "projects", projectId, "agents", "agent-1", "instructions");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/agents/agent-1/instructions",
      headers: { "x-project-id": projectId },
      payload: { mode: "external", rootPath: validRoot },
    });
    expect(res.statusCode).toBe(200);
  });

  it("PATCH /api/agents/:id/instructions rejects rootPath outside ~/.orch8/projects/", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/agents/agent-1/instructions",
      headers: { "x-project-id": projectId },
      payload: { mode: "external", rootPath: "/etc" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });

  it("PATCH /api/agents/:id/instructions rejects rootPath that escapes via ..", async () => {
    const sneaky = join(homedir(), ".orch8", "projects", "..", "..", "etc");
    const res = await app.inject({
      method: "PATCH",
      url: "/api/agents/agent-1/instructions",
      headers: { "x-project-id": projectId },
      payload: { mode: "external", rootPath: sneaky },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });

  it("PATCH /api/agents/:id/instructions rejects invalid mode enum", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/agents/agent-1/instructions",
      headers: { "x-project-id": projectId },
      payload: { mode: "bogus" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
  });
});
