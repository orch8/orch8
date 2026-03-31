import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "../api/client.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

describe("api client", () => {
  it("patch sends PATCH request with JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "1", name: "updated" }),
    });

    const result = await api.patch("/agents/a1", { name: "updated" });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/agents/a1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "updated" }),
      }),
    );
    expect(result).toEqual({ id: "1", name: "updated" });
  });

  it("get appends query params to URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await api.get("/tasks", { projectId: "p1", column: "backlog" });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks?projectId=p1&column=backlog",
      expect.any(Object),
    );
  });

  it("get omits undefined query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await api.get("/tasks", { projectId: "p1", column: undefined });

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks?projectId=p1",
      expect.any(Object),
    );
  });
});
