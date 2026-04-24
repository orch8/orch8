import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { AgentService } from "../services/agent.service.js";
import { hashAgentToken } from "../api/middleware/agent-token.js";
import { readAgentToken } from "../services/agent-token-store.js";

describe("Agent token rehydration", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await setupTestDb();
  }, 60_000);

  afterAll(async () => {
    await teardownTestDb(testDb);
  });

  it("rotates agents with token hashes but missing token files", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "agent-rehydrate-"));
    const [project] = await testDb.db
      .insert(projects)
      .values({
        name: "Rehydrate",
        slug: `rehydrate-${Date.now()}`,
        homeDir,
      })
      .returning();

    const originalHash = hashAgentToken("lost-token");
    await testDb.db.insert(agents).values({
      id: "rehydrate-agent",
      projectId: project.id,
      name: "Rehydrate Agent",
      role: "engineer",
      agentTokenHash: originalHash,
    });

    const service = new AgentService(testDb.db);
    await service.rehydrateMissingAgentTokens();

    const token = await readAgentToken(homeDir, "rehydrate-agent");
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    const [updated] = await testDb.db
      .select()
      .from(agents)
      .where(eq(agents.id, "rehydrate-agent"));
    expect(updated.agentTokenHash).toBe(hashAgentToken(token!));
    expect(updated.agentTokenHash).not.toBe(originalHash);
  });
});
