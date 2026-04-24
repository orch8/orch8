import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { projects } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { ProjectService, deriveProjectKey } from "../services/project.service.js";

describe("ProjectService", () => {
  let testDb: TestDb;
  let service: ProjectService;

  beforeAll(async () => {
    testDb = await setupTestDb();
    service = new ProjectService(testDb.db);
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  beforeEach(async () => {
    await testDb.db.delete(projects);
  });

  it("derives a project key from the slug", async () => {
    const project = await service.create({
      name: "Catalyst",
      slug: "catalyst-api",
      homeDir: "/tmp/catalyst",
    });

    expect(project.key).toBe("CAT");
    expect(project.nextTaskNumber).toBe(1);
  });

  it("accepts an explicit key override", async () => {
    const project = await service.create({
      name: "Internal Tools",
      slug: "internal-tools",
      key: "OPS",
      homeDir: "/tmp/internal",
    });

    expect(project.key).toBe("OPS");
  });

  it("rejects invalid key overrides", async () => {
    await expect(service.create({
      name: "Bad",
      slug: "bad",
      key: "1bad",
      homeDir: "/tmp/bad",
    })).rejects.toThrow("Project key must be");
  });

  it("requires explicit keys for slugs that cannot derive a valid key", () => {
    expect(() => deriveProjectKey("1")).toThrow("Project key is required");
  });

  it("resolves project IDs by slug and canonical ID", async () => {
    const project = await service.create({
      name: "Lookup",
      slug: "lookup",
      homeDir: "/tmp/lookup",
    });

    await expect(service.resolveProjectId("lookup")).resolves.toBe(project.id);
    await expect(service.resolveProjectId(project.id)).resolves.toBe(project.id);
  });
});
