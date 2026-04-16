import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { agentInstructionRoutes } from "../api/routes/agent-instructions.js";
import "../types.js";

let testDb: TestDb;
let app: FastifyInstance;
let projectHome: string;
let projectId: string;

beforeAll(async () => {
  testDb = await setupTestDb();
}, 60_000);

afterAll(async () => {
  await teardownTestDb(testDb);
});

beforeEach(async () => {
  await testDb.db.delete(agents);
  await testDb.db.delete(projects);

  projectHome = await mkdtemp(join(tmpdir(), "agent-instr-"));
  const [p] = await testDb.db.insert(projects).values({
    name: "P",
    slug: `p-${Date.now()}`,
    homeDir: projectHome,
    worktreeDir: projectHome,
  }).returning();
  projectId = p.id;

  await testDb.db.insert(agents).values({
    id: "custom-bot",
    projectId,
    name: "Bot",
    role: "custom",
  });

  app = Fastify();
  app.decorate("db", testDb.db);
  app.decorateRequest("projectId", "");
  app.addHook("preHandler", async (req) => {
    (req as { projectId?: string }).projectId = projectId;
  });
  app.decorate("projectService", {
    getById: async () => ({ id: projectId, homeDir: projectHome }),
  } as never);
  await app.register(agentInstructionRoutes);
  await app.ready();
});

afterEach(async () => {
  await app?.close();
  if (projectHome) {
    await rm(projectHome, { recursive: true, force: true });
  }
});

describe("GET /api/agents/:id/instructions", () => {
  it("returns empty strings when files are missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/agents/custom-bot/instructions" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ agentsMd: "", heartbeatMd: "" });
  });

  it("returns file contents when present", async () => {
    const dir = join(projectHome, ".orch8", "agents", "custom-bot");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "AGENTS.md"), "agents body");
    await writeFile(join(dir, "heartbeat.md"), "hb body");

    const res = await app.inject({ method: "GET", url: "/api/agents/custom-bot/instructions" });
    expect(res.json()).toEqual({ agentsMd: "agents body", heartbeatMd: "hb body" });
  });
});

describe("PUT /api/agents/:id/instructions", () => {
  it("writes AGENTS.md when provided", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/agents/custom-bot/instructions",
      payload: { agentsMd: "new body" },
    });
    expect(res.statusCode).toBe(200);
    const written = await readFile(
      join(projectHome, ".orch8", "agents", "custom-bot", "AGENTS.md"),
      "utf-8",
    );
    expect(written).toBe("new body");
  });

  it("writes heartbeat.md when provided", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/agents/custom-bot/instructions",
      payload: { heartbeatMd: "hb new" },
    });
    expect(res.statusCode).toBe(200);
    const written = await readFile(
      join(projectHome, ".orch8", "agents", "custom-bot", "heartbeat.md"),
      "utf-8",
    );
    expect(written).toBe("hb new");
  });
});

describe("slug validation & existence", () => {
  it("GET with invalid slug returns 400", async () => {
    // Fastify decodes %2F back to `/` at routing time, so the router won't
    // match at all — exercise the slug regex directly with a literal `..`.
    const res = await app.inject({ method: "GET", url: "/api/agents/..escape/instructions" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "validation_error" });
  });

  it("PUT with invalid slug returns 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/agents/..escape/instructions",
      payload: { agentsMd: "nope" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "validation_error" });
  });

  it("GET for a non-existent agent returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/agents/does-not-exist/instructions",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT for a non-existent agent returns 404", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/agents/does-not-exist/instructions",
      payload: { agentsMd: "nope" },
    });
    expect(res.statusCode).toBe(404);
  });
});
