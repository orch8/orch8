import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { eq } from "drizzle-orm";
import { projects, agents } from "@orch/shared/db";
import { setupTestDb, teardownTestDb, type TestDb } from "./helpers/test-db.js";
import { authPlugin, type AuthPluginOptions } from "../api/middleware/auth.js";
import { generateAgentToken, hashAgentToken } from "../api/middleware/agent-token.js";
import "../types.js";

const ADMIN_TOKEN = "a".repeat(64);

describe("Auth Middleware", () => {
  let testDb: TestDb;
  let projectId: string;
  let legacyAgentId: string;
  let tokenedAgentId: string;
  let agentRawToken: string;

  beforeAll(async () => {
    testDb = await setupTestDb();

    const [project] = await testDb.db.insert(projects).values({
      name: "Auth Test",
      slug: "auth-test",
      homeDir: "/tmp/auth",
      worktreeDir: "/tmp/auth-wt",
    }).returning();
    projectId = project.id;

    // Legacy agent with no token hash (migration-window compatibility path).
    legacyAgentId = "legacy-agent";
    await testDb.db.insert(agents).values({
      id: legacyAgentId,
      projectId,
      name: "Legacy Agent",
      role: "engineer",
    });

    // Agent with a hashed bearer token set (the new, preferred path).
    tokenedAgentId = "tokened-agent";
    agentRawToken = generateAgentToken();
    await testDb.db.insert(agents).values({
      id: tokenedAgentId,
      projectId,
      name: "Tokened Agent",
      role: "engineer",
      agentTokenHash: hashAgentToken(agentRawToken),
    });
  }, 60_000);

  afterAll(async () => {
    // Clear hash to avoid conflicting with other test suites sharing
    // the embedded postgres instance.
    await testDb.db
      .update(agents)
      .set({ agentTokenHash: null })
      .where(eq(agents.id, tokenedAgentId));
    await teardownTestDb(testDb);
  });

  function buildApp(opts: AuthPluginOptions = {}) {
    const app = Fastify();
    app.decorate("db", testDb.db);
    app.register(authPlugin, opts);
    app.get("/test", async (request) => ({
      isAdmin: request.isAdmin ?? false,
      agentId: request.agent?.id ?? null,
      projectId: request.projectId ?? null,
      runId: request.runId ?? null,
    }));
    return app;
  }

  // ─── Agent auth ────────────────────────────────────────

  it("authenticates legacy agent with no token on record (migration window)", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": legacyAgentId,
        "x-project-id": projectId,
        "x-run-id": "run_abc123",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agentId).toBe(legacyAgentId);
    expect(body.runId).toBe("run_abc123");
    expect(body.isAdmin).toBe(false);
    await app.close();
  });

  it("rejects agent that does not belong to project", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": "nonexistent-agent",
        "x-project-id": projectId,
      },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("accepts an agent whose stored token hash matches the supplied bearer", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": tokenedAgentId,
        "x-project-id": projectId,
        authorization: `Bearer ${agentRawToken}`,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.agentId).toBe(tokenedAgentId);
    await app.close();
  });

  it("rejects an agent whose token hash does not match", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": tokenedAgentId,
        "x-project-id": projectId,
        authorization: "Bearer wrong-token",
      },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an agent with a token on record but no bearer supplied", async () => {
    const app = buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-agent-id": tokenedAgentId,
        "x-project-id": projectId,
      },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  // ─── Admin auth ────────────────────────────────────────

  it("grants admin access when the Bearer admin token matches", async () => {
    const app = buildApp({ adminToken: ADMIN_TOKEN });
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        authorization: `Bearer ${ADMIN_TOKEN}`,
        "x-project-id": projectId,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.isAdmin).toBe(true);
    expect(body.projectId).toBe(projectId);
    await app.close();
  });

  it("returns 401 when Bearer token does not match configured admin token", async () => {
    const app = buildApp({ adminToken: ADMIN_TOKEN });
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        authorization: "Bearer totally-wrong-token",
      },
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 when no auth header is supplied and localhost bypass is disabled", async () => {
    const app = buildApp({ adminToken: ADMIN_TOKEN });
    const response = await app.inject({
      method: "GET",
      url: "/test",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects localhost request by default (allow_localhost_admin=false)", async () => {
    const app = buildApp({ adminToken: null });
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-project-id": projectId,
      },
      remoteAddress: "127.0.0.1",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("grants admin on localhost when allow_localhost_admin=true", async () => {
    const app = buildApp({ allowLocalhostAdmin: true });
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-project-id": projectId,
      },
      remoteAddress: "127.0.0.1",
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.isAdmin).toBe(true);
    expect(body.projectId).toBe(projectId);
    await app.close();
  });

  it("does not grant admin from non-loopback origin even when allow_localhost_admin=true", async () => {
    const app = buildApp({ allowLocalhostAdmin: true });
    const response = await app.inject({
      method: "GET",
      url: "/test",
      headers: {
        "x-project-id": projectId,
      },
      remoteAddress: "10.0.0.5",
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
