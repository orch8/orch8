import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { AgentWizard } from "../components/agent-editor/AgentWizard.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("AgentWizard", () => {
  it("renders template step first", () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(
      <AgentWizard projectId="proj_1" onCreated={() => {}} />,
    );
    expect(screen.getByText("Implementer")).toBeInTheDocument();
    expect(screen.getByText("Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Blank Agent")).toBeInTheDocument();
  });

  it("advances to Identity step after selecting template", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(
      <AgentWizard projectId="proj_1" onCreated={() => {}} />,
    );

    await userEvent.click(screen.getByText("Implementer"));
    await userEvent.click(screen.getByText("Next"));

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
  });

  it("shows all 5 step labels in progress indicator", () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(
      <AgentWizard projectId="proj_1" onCreated={() => {}} />,
    );
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Prompts")).toBeInTheDocument();
    expect(screen.getByText("Permissions")).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
  });
});
