import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { RunViewer } from "../components/runs/RunViewer.js";
const state = vi.hoisted(() => ({ status: "running", refetch: vi.fn() }));
vi.mock("../hooks/useRuns.js", () => ({
  useRun: () => ({ data: { id: "run_1", status: state.status } }),
  useRunLog: () => ({ data: null, refetch: state.refetch }),
}));
vi.mock("../hooks/useRunEvents.js", () => ({ useRunEvents: () => ({ data: [] }), useRunEventStream: vi.fn() }));
vi.mock("../hooks/useModalA11y.js", () => ({ useModalA11y: vi.fn() }));
describe("run evidence after completion", () => {
  it("reloads a log fetched empty during execution when the run finishes", () => {
    state.status = "running";
    state.refetch.mockClear();
    const { rerender } = render(<RunViewer runId="run_1" projectId="proj_1" onClose={() => {}} />);
    expect(state.refetch).not.toHaveBeenCalled();
    state.status = "succeeded";
    rerender(<RunViewer runId="run_1" projectId="proj_1" onClose={() => {}} />);
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
});
