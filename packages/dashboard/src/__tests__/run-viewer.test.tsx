import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test-utils.js";
import { RunEventCard } from "../components/runs/RunEventCard.js";
import type { RunEvent } from "@orch/shared";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

function makeEvent(overrides: Partial<RunEvent> = {}): RunEvent {
  return {
    id: "evt_1",
    runId: "run_1",
    projectId: "proj_1",
    seq: 0,
    timestamp: "2026-04-01T10:00:00.000Z",
    eventType: "init",
    toolName: null,
    summary: "Session initialized (claude-sonnet-4-6)",
    payload: {},
    createdAt: "2026-04-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("RunEventCard", () => {
  it("renders event summary", () => {
    renderWithProviders(
      <RunEventCard event={makeEvent()} />,
    );
    expect(screen.getByText(/Session initialized/)).toBeInTheDocument();
  });

  it("renders tool_use event with tool icon context", () => {
    renderWithProviders(
      <RunEventCard
        event={makeEvent({
          eventType: "tool_use",
          toolName: "Read",
          summary: "Read /src/index.ts",
        })}
      />,
    );
    expect(screen.getByText(/Read/)).toBeInTheDocument();
  });

  it("shows relative timestamp when base timestamp provided", () => {
    renderWithProviders(
      <RunEventCard
        event={makeEvent({ timestamp: "2026-04-01T10:00:30.000Z" })}
        baseTimestamp="2026-04-01T10:00:00.000Z"
      />,
    );
    expect(screen.getByText("+30s")).toBeInTheDocument();
  });

  it("expands payload on click", async () => {
    const { user } = renderWithProviders(
      <RunEventCard
        event={makeEvent({ payload: { type: "system", subtype: "init" } })}
      />,
    );

    // Payload should not be visible initially
    expect(screen.queryByText(/"subtype"/)).not.toBeInTheDocument();

    // Click to expand
    const card = screen.getByText(/Session initialized/).closest("[class*='cursor-pointer']")!;
    await user.click(card);

    await waitFor(() => {
      expect(screen.getByText(/"subtype"/)).toBeInTheDocument();
    });
  });
});
