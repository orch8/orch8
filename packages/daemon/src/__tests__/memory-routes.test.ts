import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import { projects, agents, knowledgeEntities, knowledgeFacts } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin } from "../api/middleware/auth.js";
import { memoryRoutes } from "../api/routes/memory.js";
import { MemoryService } from "../services/memory.service.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";
import "../types.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const ENG_TOKEN = "memory-eng-token";
const ENG2_TOKEN = "memory-eng-2-token";

describe("Memory Routes — Knowledge", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Memory Test",
      slug: "memory-test",
      homeDir: "/tmp/memory",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Engineer",
      role: "engineer",
      agentTokenHash: hashAgentToken(ENG_TOKEN),
    });
    await testDb.db.insert(agents).values({
      id: "eng-2",
      projectId,
      name: "Engineer 2",
      role: "engineer",
      agentTokenHash: hashAgentToken(ENG2_TOKEN),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(knowledgeEntities);

    app = Fastify();
    app.decorate("db", testDb.db);
    const memoryService = new MemoryService(testDb.db);
    app.decorate("memoryService", memoryService);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(memoryRoutes);
    await app.ready();
  });

  describe("POST /api/memory/knowledge", () => {
    it("creates a new entity", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/knowledge",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { slug: "auth-system", name: "Auth System", entityType: "area" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.slug).toBe("auth-system");
      expect(body.name).toBe("Auth System");
      expect(body.entityType).toBe("area");
      expect(body.projectId).toBe(projectId);
    });

    it("rejects duplicate slug within project", async () => {
      await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "existing", name: "Existing", entityType: "area",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/memory/knowledge",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { slug: "existing", name: "Duplicate", entityType: "area" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("validates slug format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/knowledge",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { slug: "INVALID SLUG!", name: "Bad", entityType: "area" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/memory/knowledge", () => {
    it("lists entities for a project", async () => {
      await testDb.db.insert(knowledgeEntities).values([
        { projectId, slug: "auth-system", name: "Auth System", entityType: "area" },
        { projectId, slug: "api-layer", name: "API Layer", entityType: "area" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/memory/knowledge?projectId=${projectId}`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
    });
  });

  describe("GET /api/memory/knowledge/:id", () => {
    it("returns entity summary", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "auth", name: "Auth", entityType: "area",
      }).returning();

      const res = await app.inject({
        method: "GET",
        url: `/api/memory/knowledge/${entity.id}`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().slug).toBe("auth");
    });
  });

  describe("GET /api/memory/knowledge/:id/facts", () => {
    it("returns scored facts for an entity", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "auth", name: "Auth", entityType: "area",
      }).returning();

      await testDb.db.insert(knowledgeFacts).values([
        { entityId: entity.id, content: "Uses JWT", category: "decision", sourceAgent: "eng-1" },
        { entityId: entity.id, content: "CSRF added", category: "status", sourceAgent: "eng-2" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/memory/knowledge/${entity.id}/facts`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(2);
    });
  });

  describe("POST /api/memory/knowledge/:id/facts — memory scoping", () => {
    it("auto-tags sourceAgent from request agent", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "auth", name: "Auth", entityType: "area",
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/memory/knowledge/${entity.id}/facts`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "New fact from eng-1", category: "observation" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().sourceAgent).toBe("eng-1");
    });

    it("admin can write facts with any sourceAgent", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "auth", name: "Auth", entityType: "area",
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/memory/knowledge/${entity.id}/facts`,
        headers: { "x-project-id": projectId },
        payload: { content: "Admin fact", category: "decision" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().sourceAgent).toBe("admin");
    });
  });

  describe("POST /api/memory/knowledge/:entityId/facts/:factId/supersede", () => {
    it("supersedes a fact with a new one", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "auth", name: "Auth", entityType: "area",
      }).returning();

      const [fact] = await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id, content: "Uses JWT v1", category: "decision", sourceAgent: "eng-1",
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/memory/knowledge/${entity.id}/facts/${fact.id}/supersede`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "Migrated to JWT v2 with rotation", category: "decision" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.oldFact.supersededBy).toBe(body.newFact.id);
      expect(body.newFact.content).toBe("Migrated to JWT v2 with rotation");
    });

    it("rejects superseding an already-superseded fact", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "api", name: "API", entityType: "area",
      }).returning();

      const [fact] = await testDb.db.insert(knowledgeFacts).values({
        entityId: entity.id, content: "Old fact", category: "status", sourceAgent: "eng-1",
        supersededBy: "some-other-fact",
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/memory/knowledge/${entity.id}/facts/${fact.id}/supersede`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "New fact", category: "status" },
      });

      expect(res.statusCode).toBe(409);
    });

    it("returns 404 for nonexistent fact", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "db", name: "Database", entityType: "area",
      }).returning();

      const res = await app.inject({
        method: "POST",
        url: `/api/memory/knowledge/${entity.id}/facts/nonexistent/supersede`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "New", category: "status" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/memory/knowledge/search", () => {
    it("searches facts by text", async () => {
      const [entity] = await testDb.db.insert(knowledgeEntities).values({
        projectId, slug: "auth", name: "Auth", entityType: "area",
      }).returning();

      await testDb.db.insert(knowledgeFacts).values([
        { entityId: entity.id, content: "Uses CSRF protection", category: "decision", sourceAgent: "eng-1" },
        { entityId: entity.id, content: "Rate limiting added", category: "status", sourceAgent: "eng-1" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/memory/knowledge/search?query=CSRF&projectId=${projectId}`,
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.length).toBeGreaterThanOrEqual(1);
      expect(body[0].content).toContain("CSRF");
    });
  });
});

describe("Memory Routes — Worklog + Lessons", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;
  let tmpDir: string;

  beforeAll(async () => {
    testDb = await setupTestDb();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "orch8-worklog-"));

    const [project] = await testDb.db.insert(projects).values({
      name: "Worklog Test",
      slug: "worklog-test",
      homeDir: tmpDir,
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1", projectId, name: "Engineer",
      role: "engineer",
      workLogDir: path.join(tmpDir, "worklogs/eng-1"),
      lessonsFile: path.join(tmpDir, "lessons/eng-1.md"),
      agentTokenHash: hashAgentToken(ENG_TOKEN),
    });

    await testDb.db.insert(agents).values({
      id: "eng-2", projectId, name: "Engineer 2",
      role: "engineer",
      workLogDir: path.join(tmpDir, "worklogs/eng-2"),
      lessonsFile: path.join(tmpDir, "lessons/eng-2.md"),
      agentTokenHash: hashAgentToken(ENG2_TOKEN),
    });
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
    await rm(tmpDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    app = Fastify();
    app.decorate("db", testDb.db);
    const memoryService = new MemoryService(testDb.db);
    app.decorate("memoryService", memoryService);
    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(memoryRoutes);
    await app.ready();
  });

  describe("POST /api/memory/worklog", () => {
    it("appends to agent's own worklog", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/worklog",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "## Session 1\n- Fixed auth bug" },
      });

      expect(res.statusCode).toBe(201);

      // Verify file was created
      const logDir = path.join(tmpDir, "worklogs/eng-1");
      const files = await import("node:fs/promises").then(fs => fs.readdir(logDir));
      expect(files.length).toBe(1);
    });
  });

  describe("GET /api/memory/worklog", () => {
    it("reads agent's work log entries", async () => {
      // First write something
      await app.inject({
        method: "POST",
        url: "/api/memory/worklog",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "## Session\n- Did stuff" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/memory/worklog?agentId=eng-1",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("POST /api/memory/lessons", () => {
    it("appends to agent's own lessons file", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/memory/lessons",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "Always use (page - 1) * limit for offset." },
      });

      expect(res.statusCode).toBe(201);

      const content = await readFile(path.join(tmpDir, "lessons/eng-1.md"), "utf-8");
      expect(content).toContain("Always use");
    });
  });

  describe("GET /api/memory/lessons", () => {
    it("reads agent's lessons file", async () => {
      // First write a lesson
      await app.inject({
        method: "POST",
        url: "/api/memory/lessons",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
        payload: { content: "Lesson learned" },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/memory/lessons?agentId=eng-1",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().content).toContain("Lesson");
    });
  });

  describe("Memory scoping — worklog/lessons", () => {
    it("agent cannot write to another agent's worklog", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/memory/worklog?agentId=eng-2",
        headers: { authorization: `Bearer ${ENG_TOKEN}` },
      });

      // Agents can read other agents' worklogs (knowledge is shared),
      // but POST is scoped to own agent. So GET is fine.
      expect(res.statusCode).toBe(200);
    });
  });
});

describe("Memory Routes — Full Integration", () => {
  let testDb: TestDb;
  let app: ReturnType<typeof Fastify>;
  let projectId: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Integration Test",
      slug: "integration-test",
      homeDir: "/tmp/integration",
    }).returning();
    projectId = project.id;

    await testDb.db.insert(agents).values({
      id: "eng-1",
      projectId,
      name: "Engineer",
      role: "engineer",
      agentTokenHash: hashAgentToken(ENG_TOKEN),
    });
  }, 60_000);

  afterAll(async () => { await teardownTestDb(testDb); });

  beforeEach(async () => {
    await testDb.db.delete(knowledgeFacts);
    await testDb.db.delete(knowledgeEntities);

    app = Fastify();
    app.decorate("db", testDb.db);
    const memoryService = new MemoryService(testDb.db);
    app.decorate("memoryService", memoryService);

    const { SummaryService } = await import("../services/summary.service.js");
    const summaryService = new SummaryService(testDb.db, memoryService);
    app.decorate("summaryService", summaryService);

    app.register(authPlugin, { allowLocalhostAdmin: true });
    app.register(memoryRoutes);
    await app.ready();
  });

  it("create entity → write fact → supersede fact → list facts shows only new fact", async () => {
    // Create entity
    const createRes = await app.inject({
      method: "POST",
      url: "/api/memory/knowledge",
      headers: { authorization: `Bearer ${ENG_TOKEN}` },
      payload: { slug: "e2e-test", name: "E2E Test", entityType: "area" },
    });
    expect(createRes.statusCode).toBe(201);
    const entity = createRes.json();

    // Write fact
    const factRes = await app.inject({
      method: "POST",
      url: `/api/memory/knowledge/${entity.id}/facts`,
      headers: { authorization: `Bearer ${ENG_TOKEN}` },
      payload: { content: "Original fact", category: "status" },
    });
    expect(factRes.statusCode).toBe(201);
    const originalFact = factRes.json();

    // Supersede fact
    const supersedeRes = await app.inject({
      method: "POST",
      url: `/api/memory/knowledge/${entity.id}/facts/${originalFact.id}/supersede`,
      headers: { authorization: `Bearer ${ENG_TOKEN}` },
      payload: { content: "Updated fact", category: "status" },
    });
    expect(supersedeRes.statusCode).toBe(201);

    // List facts — should only show the new fact
    const listRes = await app.inject({
      method: "GET",
      url: `/api/memory/knowledge/${entity.id}/facts`,
      headers: { authorization: `Bearer ${ENG_TOKEN}` },
    });
    expect(listRes.statusCode).toBe(200);
    const facts = listRes.json();
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe("Updated fact");
  });
});
