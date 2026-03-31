import { describe, it, expect } from "vitest";
import Fastify from "fastify";

describe("Structured logging", () => {
  it("includes correlation IDs from request headers in logs", async () => {
    const logEntries: unknown[] = [];

    const app = Fastify({
      logger: {
        level: "info",
        stream: {
          write(msg: string) {
            try {
              logEntries.push(JSON.parse(msg));
            } catch { /* ignore */ }
          },
        },
      },
    });

    // Register the same onRequest hook used in server.ts
    app.addHook("onRequest", async (request) => {
      const childBindings: Record<string, string> = {};
      if (request.headers["x-agent-id"]) {
        childBindings.agentId = request.headers["x-agent-id"] as string;
      }
      if (request.headers["x-project-id"]) {
        childBindings.projectId = request.headers["x-project-id"] as string;
      }
      if (request.headers["x-run-id"]) {
        childBindings.runId = request.headers["x-run-id"] as string;
      }
      if (Object.keys(childBindings).length > 0) {
        request.log = request.log.child(childBindings);
      }
    });

    app.get("/api/test-log", async (request, reply) => {
      request.log.info("test log message");
      return { ok: true };
    });

    await app.ready();

    await app.inject({
      method: "GET",
      url: "/api/test-log",
      headers: {
        "x-agent-id": "test-agent",
        "x-project-id": "test-project",
        "x-run-id": "test-run",
      },
    });

    const testLogEntry = logEntries.find(
      (e: any) => e.msg === "test log message",
    );
    expect(testLogEntry).toBeDefined();
    expect((testLogEntry as any).agentId).toBe("test-agent");
    expect((testLogEntry as any).projectId).toBe("test-project");
    expect((testLogEntry as any).runId).toBe("test-run");

    await app.close();
  });
});
