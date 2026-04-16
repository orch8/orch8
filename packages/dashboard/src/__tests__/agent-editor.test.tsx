import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { AgentEditor } from "../components/agent-editor/AgentEditor.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockAgents = [
  {
    id: "eng",
    projectId: "proj_1",
    name: "Engineer",
    role: "engineer",
    status: "active",
    model: "claude-sonnet-4-6",
    budgetLimitUsd: 10,
    budgetSpentUsd: 3.5,
    heartbeatEnabled: true,
    heartbeatIntervalSec: 300,
  },
  {
    id: "qa",
    projectId: "proj_1",
    name: "QA",
    role: "qa",
    status: "paused",
    model: "claude-haiku-4-5-20251001",
    budgetLimitUsd: 5,
    budgetSpentUsd: 1.2,
    heartbeatEnabled: false,
  },
];

describe("AgentEditor", () => {
  it("renders agent list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAgents),
    });

    renderWithProviders(<AgentEditor projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("Engineer")).toBeInTheDocument();
      expect(screen.getByText("QA")).toBeInTheDocument();
    });
  });

  it("shows agent status badges", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockAgents),
    });

    renderWithProviders(<AgentEditor projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("active")).toBeInTheDocument();
      expect(screen.getByText("paused")).toBeInTheDocument();
    });
  });
});
