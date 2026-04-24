import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { fireEvent } from "@testing-library/react";
import { RunViewer } from "../components/runs/RunViewer.js";

vi.mock("../hooks/WsEventsProvider.js", () => ({
  useWsEvents: () => ({
    connected: true,
    send: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("RunViewer a11y", () => {
  const mockRun = {
    id: "run_1",
    agentId: "eng",
    projectId: "proj_1",
    taskId: "task_1",
    status: "succeeded",
    startedAt: "2026-03-30T10:00:00Z",
    finishedAt: "2026-03-30T10:05:00Z",
    costUsd: 0.25,
    invocationSource: "timer",
  };

  function mockApi() {
    mockFetch.mockImplementation((input: any) => {
      const url = String(input ?? "");
      if (url.includes("/runs/run_1/events")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes("/runs/run_1/log")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ content: "", store: "file", bytes: 0 }) });
      }
      if (url.includes("/runs/run_1")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockRun) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  }

  it("marks the dialog with role=dialog and aria-modal", async () => {
    mockApi();
    renderWithProviders(
      <RunViewer runId="run_1" projectId="proj_1" onClose={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "run-viewer-title");
    expect(screen.getByText("run_1").id).toBe("run-viewer-title");
  });

  it("closes on Escape key", async () => {
    mockApi();
    const onClose = vi.fn();
    renderWithProviders(
      <RunViewer runId="run_1" projectId="proj_1" onClose={onClose} />,
    );

    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
