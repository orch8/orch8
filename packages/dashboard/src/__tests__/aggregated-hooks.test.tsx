import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTasks } from "../hooks/useTasks.js";
import { useAgents } from "../hooks/useAgents.js";
import { useRuns } from "../hooks/useRuns.js";
import { useCostSummary } from "../hooks/useCost.js";
import type { ReactNode } from "react";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => mockFetch.mockReset());

describe("Hooks with null projectId (aggregated view)", () => {
  it("useTasks fetches all tasks when projectId is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: "t1" }, { id: "t2" }]),
    });

    const { result } = renderHook(() => useTasks(null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tasks"),
      expect.anything(),
    );
  });

  it("useAgents fetches all agents when projectId is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: "a1" }]),
    });

    const { result } = renderHook(() => useAgents(null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("useRuns fetches all runs when projectId is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ id: "r1" }]),
    });

    const { result } = renderHook(() => useRuns(null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("useCostSummary fetches aggregate when projectId is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ total: 10, byAgent: [] }),
    });

    const { result } = renderHook(() => useCostSummary(null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total).toBe(10);
  });
});
