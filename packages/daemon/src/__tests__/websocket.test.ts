import { describe, it, expect, afterAll } from "vitest";
import WebSocket from "ws";
import { buildServer } from "../server.js";

describe("WebSocket", () => {
  const server = buildServer();
  let address: string;

  afterAll(async () => {
    await server.close();
  });

  it("accepts a WebSocket connection at /ws", async () => {
    address = await server.listen({ port: 0, host: "127.0.0.1" });
    const wsUrl = address.replace("http", "ws") + "/ws";

    const connected = await new Promise<boolean>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on("open", () => {
        ws.close();
        resolve(true);
      });
      ws.on("error", reject);
    });

    expect(connected).toBe(true);
  });

  it("echoes ping messages as pong", async () => {
    const wsUrl = address.replace("http", "ws") + "/ws";

    const response = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "ping" }));
      });
      ws.on("message", (data) => {
        ws.close();
        resolve(data.toString());
      });
      ws.on("error", reject);
    });

    const parsed = JSON.parse(response);
    expect(parsed.type).toBe("pong");
  });
});
