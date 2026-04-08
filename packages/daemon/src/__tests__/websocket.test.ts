import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import WebSocket from "ws";
import { websocketRoutes } from "../api/websocket.js";
import { BroadcastService } from "../services/broadcast.service.js";
import "../types.js";

describe("WebSocket", () => {
  // Minimal fastify app wired with just what /ws needs:
  //   - fastify-websocket plugin
  //   - BroadcastService decoration (the /ws handler calls register/unregister)
  //   - An onRequest hook that stubs request.isAdmin = true so the auth gate
  //     in the /ws handler accepts the connection
  const app = Fastify();
  let address: string;

  beforeAll(async () => {
    await app.register(fastifyWebsocket);
    app.decorate("broadcastService", new BroadcastService());
    app.addHook("onRequest", async (request) => {
      request.isAdmin = true;
    });
    await app.register(websocketRoutes);
    address = await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts a WebSocket connection at /ws", async () => {
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

  it("rejects unauthenticated connections", async () => {
    // Spin up a second app that does NOT set request.isAdmin — the /ws handler
    // should close the socket with policy-violation code 1008.
    const app2 = Fastify();
    await app2.register(fastifyWebsocket);
    app2.decorate("broadcastService", new BroadcastService());
    await app2.register(websocketRoutes);
    const addr2 = await app2.listen({ port: 0, host: "127.0.0.1" });
    try {
      const wsUrl = addr2.replace("http", "ws") + "/ws";
      const closed = await new Promise<{ code: number; reason: string }>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
        ws.on("error", reject);
      });
      expect(closed.code).toBe(1008);
    } finally {
      await app2.close();
    }
  });
});
