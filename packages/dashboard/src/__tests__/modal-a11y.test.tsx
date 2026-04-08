import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/react";
import { TaskCreateModal } from "../components/kanban/TaskCreateModal.js";
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

describe("TaskCreateModal a11y", () => {
  it("marks the dialog with role=dialog and aria-modal", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithProviders(
      <TaskCreateModal projectId="proj_1" open onClose={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "task-create-modal-title");
    expect(screen.getByText("Create Task").id).toBe("task-create-modal-title");
  });

  it("closes on Escape key", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const onClose = vi.fn();
    renderWithProviders(
      <TaskCreateModal projectId="proj_1" open onClose={onClose} />,
    );

    // Wait for dialog to mount (the modal renders synchronously, but the hook
    // focus-install runs in effect — Escape should still work from the very
    // first keydown).
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog content", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    const onClose = vi.fn();
    renderWithProviders(
      <TaskCreateModal projectId="proj_1" open onClose={onClose} />,
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cycles Tab between first and last focusable elements", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithProviders(
      <TaskCreateModal projectId="proj_1" open onClose={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog");
    const focusables = dialog.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    );
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    // On mount, the first focusable gets focus.
    await waitFor(() => {
      expect(document.activeElement).toBe(first);
    });

    // Shift+Tab from the first should wrap to the last.
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    // Tab from the last should wrap to the first.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });
});

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
