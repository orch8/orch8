import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRunEvents } from "../hooks/useRunEvents.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => mockFetch.mockReset());

describe("useRunEvents", () => {
  it("includes projectId in the query key so two projects with the same runId do not collide", async () => {
    const { qc, wrapper } = makeWrapper();

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { seq: 0, eventType: "tool_use", summary: "from proj_a" },
          ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { seq: 0, eventType: "tool_use", summary: "from proj_b" },
          ]),
      });

    const { result: a } = renderHook(() => useRunEvents("run_1", "proj_a"), { wrapper });
    const { result: b } = renderHook(() => useRunEvents("run_1", "proj_b"), { wrapper });

    await waitFor(() => {
      expect(a.current.isSuccess).toBe(true);
      expect(b.current.isSuccess).toBe(true);
    });

    // Each hook should have its own cache entry — if projectId were missing
    // from the key, both hooks would share `["run-events", "run_1"]` and the
    // second hook would replay the first hook's data without a new fetch.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(a.current.data?.[0]?.summary).toBe("from proj_a");
    expect(b.current.data?.[0]?.summary).toBe("from proj_b");

    // Direct cache-level assertion: both keys must exist independently.
    const entryA = qc.getQueryData(["run-events", "run_1", "proj_a"]);
    const entryB = qc.getQueryData(["run-events", "run_1", "proj_b"]);
    expect(entryA).not.toBeUndefined();
    expect(entryB).not.toBeUndefined();
    expect(entryA).not.toEqual(entryB);
  });

  it("does not fetch when runId is null", () => {
    const { wrapper } = makeWrapper();
    renderHook(() => useRunEvents(null, "proj_a"), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
