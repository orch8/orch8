import { describe, it, expect, vi } from "vitest";
import type { WebSocket } from "ws";
import { BroadcastService } from "../services/broadcast.service.js";

function createMockSocket() {
  return { readyState: 1, send: vi.fn() };
}

describe("BroadcastService", () => {
  it("sends typed event to all connected sockets", () => {
    const sockets = new Set([createMockSocket(), createMockSocket()]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.taskTransitioned("proj_1", {
      taskId: "task_1",
      from: "backlog",
      to: "in_progress",
    });

    for (const s of sockets) {
      const payload = JSON.parse(s.send.mock.calls[0][0]);
      expect(payload.type).toBe("task_transitioned");
      expect(payload.taskId).toBe("task_1");
      expect(payload.from).toBe("backlog");
      expect(payload.to).toBe("in_progress");
    }
  });

  it("skips sockets that are not open (readyState !== 1)", () => {
    const open = createMockSocket();
    const closed = createMockSocket();
    closed.readyState = 3;
    const sockets = new Set([open, closed]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.runCreated("proj_1", { runId: "run_1", agentId: "eng", status: "queued" });

    expect(open.send).toHaveBeenCalledOnce();
    expect(closed.send).not.toHaveBeenCalled();
  });

  it("emits agent_paused with agentId and reason", () => {
    const socket = createMockSocket();
    const sockets = new Set([socket]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.agentPaused("proj_1", { agentId: "eng", reason: "budget" });

    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload.type).toBe("agent_paused");
    expect(payload.agentId).toBe("eng");
    expect(payload.reason).toBe("budget");
  });

  it("emits agent_resumed with agentId", () => {
    const socket = createMockSocket();
    const sockets = new Set([socket]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.agentResumed("proj_1", { agentId: "eng" });

    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload.type).toBe("agent_resumed");
    expect(payload.agentId).toBe("eng");
  });

  it("emits run_completed with costUsd", () => {
    const socket = createMockSocket();
    const sockets = new Set([socket]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.runCompleted("proj_1", {
      runId: "run_1",
      agentId: "eng",
      status: "succeeded",
      costUsd: 0.04,
    });

    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload.type).toBe("run_completed");
    expect(payload.status).toBe("succeeded");
    expect(payload.costUsd).toBe(0.04);
  });

  it("emits run_failed with error info", () => {
    const socket = createMockSocket();
    const sockets = new Set([socket]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.runFailed("proj_1", {
      runId: "run_1",
      agentId: "eng",
      status: "failed",
      error: "Agent not found",
    });

    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload.type).toBe("run_failed");
    expect(payload.error).toBe("Agent not found");
  });

  it("emits budget_alert with threshold info", () => {
    const socket = createMockSocket();
    const sockets = new Set([socket]);
    const bs = new BroadcastService(sockets as unknown as Set<import("ws").WebSocket>);

    bs.budgetAlert("proj_1", {
      level: "agent",
      entityId: "eng",
      message: "Agent budget exhausted",
      budgetLimitUsd: 1.0,
      budgetSpentUsd: 1.02,
    });

    const payload = JSON.parse(socket.send.mock.calls[0][0]);
    expect(payload.type).toBe("budget_alert");
    expect(payload.level).toBe("agent");
    expect(payload.entityId).toBe("eng");
  });

  it("filters events by socket projectId scope (tenant isolation)", () => {
    const socketA = createMockSocket();
    const socketB = createMockSocket();
    const bs = new BroadcastService();

    bs.register(socketA as unknown as WebSocket, { projectId: "proj_a" });
    bs.register(socketB as unknown as WebSocket, { projectId: "proj_b" });

    bs.taskTransitioned("proj_a", { taskId: "t1", from: "backlog", to: "in_progress" });

    expect(socketA.send).toHaveBeenCalledOnce();
    expect(socketB.send).not.toHaveBeenCalled();

    bs.taskTransitioned("proj_b", { taskId: "t2", from: "backlog", to: "in_progress" });

    expect(socketA.send).toHaveBeenCalledOnce(); // still just the first
    expect(socketB.send).toHaveBeenCalledOnce();
  });

  it("delivers system events (daemon:log, daemon:stats) to every scoped socket", () => {
    const socketA = createMockSocket();
    const socketB = createMockSocket();
    const bs = new BroadcastService();
    bs.register(socketA as unknown as WebSocket, { projectId: "proj_a" });
    bs.register(socketB as unknown as WebSocket, { projectId: "proj_b" });

    bs.daemonLog({ level: "info", message: "hi", timestamp: "2026-04-08T00:00:00Z" });

    expect(socketA.send).toHaveBeenCalledOnce();
    expect(socketB.send).toHaveBeenCalledOnce();
  });

  it("admin-scoped sockets receive all project events", () => {
    const adminSocket = createMockSocket();
    const bs = new BroadcastService();
    bs.register(adminSocket as unknown as WebSocket, { isAdmin: true });

    bs.taskTransitioned("proj_a", { taskId: "t1", from: "backlog", to: "in_progress" });
    bs.taskTransitioned("proj_b", { taskId: "t2", from: "backlog", to: "in_progress" });

    expect(adminSocket.send).toHaveBeenCalledTimes(2);
  });

  it("unregister stops delivery to a socket", () => {
    const socket = createMockSocket();
    const bs = new BroadcastService();
    bs.register(socket as unknown as WebSocket, { projectId: "proj_a" });
    bs.unregister(socket as unknown as WebSocket);

    bs.taskTransitioned("proj_a", { taskId: "t1", from: "backlog", to: "in_progress" });

    expect(socket.send).not.toHaveBeenCalled();
  });

  it("broadcasts run_event to all connected sockets", () => {
    const s1 = createMockSocket();
    const s2 = createMockSocket();
    const sockets = new Set([s1, s2]) as unknown as Set<WebSocket>;
    const bs = new BroadcastService(sockets);

    bs.runEvent("proj_1", {
      runId: "run_1",
      seq: 0,
      eventType: "init",
      toolName: null,
      summary: "Session initialized (claude-sonnet-4-6)",
      timestamp: "2026-04-01T10:00:00.000Z",
      payload: { type: "system", subtype: "init" },
    });

    for (const s of [s1, s2]) {
      const payload = JSON.parse(s.send.mock.calls[0][0]);
      expect(payload.type).toBe("run_event");
      expect(payload.runId).toBe("run_1");
      expect(payload.seq).toBe(0);
      expect(payload.eventType).toBe("init");
    }
  });
});
