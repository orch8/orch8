import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { AgentSettingsPage } from "../components/agent-settings/AgentSettingsPage.js";

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
  model: "claude-opus-4-6",
  effort: "medium",
  maxTurns: 25,
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
  systemPrompt: "You are an engineer.",
  promptTemplate: "",
  bootstrapPromptTemplate: "",
  instructionsFilePath: null,
  researchPrompt: "",
  planPrompt: "",
  implementPrompt: "",
  reviewPrompt: "",
  mcpTools: [],
  skillPaths: [],
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
  it("renders all six tab labels", () => {
    renderWithProviders(
      <AgentSettingsPage agent={mockAgent} projectId="proj_1" />,
    );
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("Skills & Tools")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
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
