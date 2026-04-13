import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { AgentWizard } from "../components/agent-editor/AgentWizard.js";

const mockBundledAgents = [
  {
    id: "implementer",
    name: "Implementer",
    role: "implementer",
    model: "claude-sonnet-4-6",
    maxTurns: 200,
    skills: ["tdd"],
    heartbeatEnabled: false,
    systemPrompt: "You are an implementer agent.",
  },
  {
    id: "reviewer",
    name: "Reviewer",
    role: "reviewer",
    model: "claude-sonnet-4-6",
    maxTurns: 180,
    skills: [],
    heartbeatEnabled: false,
    systemPrompt: "You are a reviewer agent.",
  },
];

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/bundled-agents")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBundledAgents) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
});

describe("AgentWizard", () => {
  it("renders template step first", async () => {
    renderWithProviders(
      <AgentWizard projectId="proj_1" onCreated={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Implementer")).toBeInTheDocument();
    });
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Blank Agent")).toBeInTheDocument();
  });

  it("advances to Identity step after selecting template", async () => {
    renderWithProviders(
      <AgentWizard projectId="proj_1" onCreated={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Implementer")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Implementer"));
    await userEvent.click(screen.getByText("Next"));

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("shows all 5 step labels in progress indicator", async () => {
    renderWithProviders(
      <AgentWizard projectId="proj_1" onCreated={() => {}} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Template")).toBeInTheDocument();
    });
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });
});
