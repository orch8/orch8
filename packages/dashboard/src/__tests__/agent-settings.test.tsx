import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { AgentSettingsPage } from "../components/agent-settings/AgentSettingsPage.js";
import { InstructionsTab } from "../components/agent-settings/InstructionsTab.js";

vi.mock("../api/client.js", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ agentsMd: "body", heartbeatMd: "hb" }),
    put: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockAgent = {
  id: "eng-1",
  projectId: "proj_1",
  name: "Engineer",
  role: "engineer",
  status: "active",
  icon: "🤖",
  color: "#888780",
  model: "claude-opus-4-7",
  effort: "medium",
  maxTurns: 180,
  allowedTools: [],
  heartbeatEnabled: false,
  heartbeatIntervalSec: 0,
  wakeOnAssignment: true,
  wakeOnOnDemand: true,
  wakeOnAutomation: true,
  maxConcurrentRuns: 1,
  maxConcurrentTasks: 1,
  maxConcurrentSubagents: 3,
  workingHours: null,
  canAssignTo: [],
  canCreateTasks: false,
  canMoveTo: [],
  mcpTools: [],
  desiredSkills: [],
  adapterType: "claude_local",
  adapterConfig: {},
  envVars: {},
  budgetLimitUsd: 100,
  budgetSpentUsd: 45.5,
  budgetPaused: false,
  autoPauseThreshold: 80,
  pauseReason: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as any;

beforeEach(() => mockFetch.mockReset());

describe("AgentSettingsPage", () => {
  it("renders all seven tab labels", () => {
    renderWithProviders(
      <AgentSettingsPage agent={mockAgent} projectId="proj_1" />,
    );
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByText("Instructions")).toBeInTheDocument();
    expect(screen.getByText("Skills & Tools")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
  });

  it("shows agent name and status in header", () => {
    renderWithProviders(
      <AgentSettingsPage agent={mockAgent} projectId="proj_1" />,
    );
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("defaults to General tab", () => {
    renderWithProviders(
      <AgentSettingsPage agent={mockAgent} projectId="proj_1" />,
    );
    // General tab should show model field
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
  });
});

describe("InstructionsTab", () => {
  it("renders both editors with loaded content", async () => {
    renderWithProviders(
      <InstructionsTab agentId="a" projectId="p" />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Save AGENTS\.md/i)).toBeInTheDocument();
      expect(screen.getByText(/Save heartbeat\.md/i)).toBeInTheDocument();
    });
  });
});
