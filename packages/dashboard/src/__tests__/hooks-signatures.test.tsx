import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAgents, useAgent } from "../hooks/useAgents.js";
import { useTasks } from "../hooks/useTasks.js";
import { useActivity } from "../hooks/useActivity.js";
import { useCostSummary, useCostTimeseries, useTaskCost, usePhaseCost } from "../hooks/useCost.js";
import { useRuns, useRun, useRunLog } from "../hooks/useRuns.js";
import { useEntities } from "../hooks/useMemory.js";
import { useNotifications } from "../hooks/useNotifications.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("Hook signatures accept non-nullable projectId", () => {
  it("useAgents(projectId: string) always fetches", async () => {
    renderHook(() => useAgents("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(mockFetch.mock.calls[0][0]).toContain("projectId=proj_1");
  });

  it("useAgent(agentId, projectId) — both strings", async () => {
    renderHook(() => useAgent("agent_1", "proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useTasks(projectId: string) always fetches", async () => {
    renderHook(() => useTasks("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useActivity(projectId: string) always fetches", async () => {
    renderHook(() => useActivity("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useCostSummary(projectId: string) always fetches", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ total: 0 }) });
    renderHook(() => useCostSummary("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useCostTimeseries(projectId: string) always fetches", async () => {
    renderHook(() => useCostTimeseries("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useRuns(projectId: string) always fetches", async () => {
    renderHook(() => useRuns("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useEntities(projectId: string) always fetches", async () => {
    renderHook(() => useEntities("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });

  it("useNotifications(projectId: string) always fetches", async () => {
    renderHook(() => useNotifications("proj_1"), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
  });
});
