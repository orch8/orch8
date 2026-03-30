import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";

describe("Daemon Server", () => {
  const server = buildServer();

  afterAll(async () => {
    await server.close();
  });

  it("responds to GET /api/health with status ok", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.0.0");
    expect(typeof body.uptime).toBe("number");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/nonexistent",
    });

    expect(response.statusCode).toBe(404);
  });
});
