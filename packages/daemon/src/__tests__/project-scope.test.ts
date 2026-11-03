import { describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { requireProjectScope } from "../api/utils/project-scope.js";

describe("requireProjectScope", () => {
  it.each([
    [{}, 401],
    [{ agent: { projectId: "a" } }, 403],
    [{ agent: { projectId: "" }, projectId: "" }, 403],
    [{ agent: { projectId: "a" }, projectId: "b" }, 403],
    [{ agent: { projectId: "b" }, projectId: "b" }, 403],
  ])("fails closed for missing/inconsistent/foreign context %j", (context, code) => {
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    expect(requireProjectScope(context as FastifyRequest, reply as unknown as FastifyReply, "a")).toBe(false);
    expect(reply.code).toHaveBeenCalledWith(code);
  });
  it.each([{ isAdmin: true, projectId: "b" }, { agent: { projectId: "a" }, projectId: "a" }])("allows authorized context %j", (context) => {
    expect(requireProjectScope(context as FastifyRequest, {} as FastifyReply, "a")).toBe(true);
  });
});
