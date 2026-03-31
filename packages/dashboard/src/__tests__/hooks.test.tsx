import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTasks, useTransitionTask } from "../hooks/useTasks.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => mockFetch.mockReset());

describe("useTasks", () => {
  it("fetches tasks for a project", async () => {
    const tasks = [
      { id: "task_1", title: "Test task", column: "backlog", projectId: "p1" },
    ];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(tasks),
    });

    const { result } = renderHook(() => useTasks("p1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(tasks);
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks?projectId=p1",
      expect.any(Object),
    );
  });

  it("fetches all tasks when projectId is null (aggregated view)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: "t1" }, { id: "t2" }]),
    });

    const { result } = renderHook(() => useTasks(null as any), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith("/api/tasks", expect.any(Object));
  });
});

describe("useTransitionTask", () => {
  it("transitions task to new column", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({ id: "task_1", column: "in_progress" }),
    });

    const { result } = renderHook(() => useTransitionTask(), { wrapper });
    result.current.mutate({ taskId: "task_1", column: "in_progress" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tasks/task_1/transition",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ column: "in_progress" }),
      }),
    );
  });
});
