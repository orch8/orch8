import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { InstructionBundleService } from "../services/instruction-bundle.service.js";
import { projects, agents, instructionBundles } from "@orch/shared/db";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { eq, and } from "drizzle-orm";

describe("InstructionBundleService", () => {
  let testDb: TestDb;
  let service: InstructionBundleService;
  let projectId: string;
  let tempDir: string;

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

    tempDir = await mkdtemp(join(tmpdir(), "orch-bundle-test-"));

    const [proj] = await testDb.db.insert(projects).values({
      name: "Bundle Test",
      slug: "bundle-test",
      homeDir: tempDir,
      worktreeDir: join(tempDir, "worktrees"),
    }).returning();
    projectId = proj.id;

    // Insert agent
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

    service = new InstructionBundleService(testDb.db, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("ensure", () => {
    it("creates bundle directory and seeds default AGENTS.md for managed mode", async () => {
      const bundle = await service.ensure("agent-1", projectId, "engineer");

      expect(bundle.mode).toBe("managed");
      expect(bundle.entryFile).toBe("AGENTS.md");
      expect(existsSync(join(bundle.rootPath, "AGENTS.md"))).toBe(true);
    });

    it("returns existing bundle on second call", async () => {
      const first = await service.ensure("agent-1", projectId, "engineer");
      const second = await service.ensure("agent-1", projectId, "engineer");

      expect(first.id).toBe(second.id);
    });

    it("sets agent instructionsFilePath to rootPath/entryFile", async () => {
      const bundle = await service.ensure("agent-1", projectId, "engineer");

      const [agent] = await testDb.db
        .select()
        .from(agents)
        .where(and(eq(agents.id, "agent-1"), eq(agents.projectId, projectId)));

      expect(agent.instructionsFilePath).toBe(join(bundle.rootPath, "AGENTS.md"));
    });
  });

  describe("get", () => {
    it("returns bundle metadata", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      const bundle = await service.get("agent-1", projectId);

      expect(bundle).not.toBeNull();
      expect(bundle!.agentId).toBe("agent-1");
    });

    it("returns null when no bundle exists", async () => {
      const bundle = await service.get("nonexistent", projectId);
      expect(bundle).toBeNull();
    });
  });

  describe("writeFile / readFile", () => {
    it("writes and reads a file in managed mode", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      await service.writeFile("agent-1", projectId, "notes.md", "# Notes\nSome notes");

      const content = await service.readFile("agent-1", projectId, "notes.md");
      expect(content).toBe("# Notes\nSome notes");
    });

    it("throws on path traversal attempt", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      await expect(
        service.readFile("agent-1", projectId, "../../etc/passwd"),
      ).rejects.toThrow(/path traversal/i);
    });

    it("throws on write to external mode bundle", async () => {
      const bundle = await service.ensure("agent-1", projectId, "engineer");
      await service.updateMode("agent-1", projectId, { mode: "external" });

      await expect(
        service.writeFile("agent-1", projectId, "new.md", "content"),
      ).rejects.toThrow(/external/i);
    });
  });

  describe("deleteFile", () => {
    it("deletes a non-entry file in managed mode", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      await service.writeFile("agent-1", projectId, "extra.md", "Extra");
      await service.deleteFile("agent-1", projectId, "extra.md");

      await expect(
        service.readFile("agent-1", projectId, "extra.md"),
      ).rejects.toThrow();
    });

    it("refuses to delete the entry file", async () => {
      await service.ensure("agent-1", projectId, "engineer");

      await expect(
        service.deleteFile("agent-1", projectId, "AGENTS.md"),
      ).rejects.toThrow(/entry file/i);
    });
  });

  describe("recover", () => {
    it("re-seeds AGENTS.md if missing in managed mode", async () => {
      const bundle = await service.ensure("agent-1", projectId, "engineer");
      const entryPath = join(bundle.rootPath, "AGENTS.md");

      // Delete the file to simulate corruption
      await rm(entryPath);
      expect(existsSync(entryPath)).toBe(false);

      await service.recover("agent-1", projectId, "engineer");
      expect(existsSync(entryPath)).toBe(true);
    });

    it("returns 'skipped' for external mode with missing file", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      await service.updateMode("agent-1", projectId, {
        mode: "external",
        rootPath: "/nonexistent/path",
      });

      const result = await service.recover("agent-1", projectId, "engineer");
      expect(result).toBe("skipped");
    });
  });

  describe("updateMode", () => {
    it("switches from managed to external", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      await service.updateMode("agent-1", projectId, {
        mode: "external",
        rootPath: "/some/external/path",
      });

      const bundle = await service.get("agent-1", projectId);
      expect(bundle!.mode).toBe("external");
      expect(bundle!.rootPath).toBe("/some/external/path");
    });
  });

  describe("listFiles", () => {
    it("returns file inventory after writes", async () => {
      await service.ensure("agent-1", projectId, "engineer");
      await service.writeFile("agent-1", projectId, "SOUL.md", "# Soul");

      const files = await service.listFiles("agent-1", projectId);
      const paths = files.map((f: any) => f.path);
      expect(paths).toContain("AGENTS.md");
      expect(paths).toContain("SOUL.md");
    });
  });
});
