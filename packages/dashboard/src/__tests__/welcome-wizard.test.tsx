import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("WelcomeWizard", () => {
  it("renders welcome step first", () => {
    renderWithProviders(<WelcomeWizard onComplete={(_projectId) => {}} />);
    expect(screen.getByText("Welcome to orch8")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("advances to Create Project step", async () => {
    renderWithProviders(<WelcomeWizard onComplete={(_projectId) => {}} />);
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("shows all 5 step labels", () => {
    renderWithProviders(<WelcomeWizard onComplete={(_projectId) => {}} />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("First Task")).toBeInTheDocument();
  });

  it("surfaces project creation errors and stays on the final step", async () => {
    // Project POST fails; bundled-agents GET returns empty (for Agents step).
    mockFetch.mockImplementation((input: any, init?: RequestInit) => {
      const url = String(input ?? "");
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/projects") && method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve("Invalid repo path"),
          json: () => Promise.resolve({ error: "Invalid repo path" }),
        });
      }
      // Default: bundled agents, tasks, etc.
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("[]"),
        json: () => Promise.resolve([]),
      });
    });

    const onComplete = vi.fn();
    renderWithProviders(<WelcomeWizard onComplete={onComplete} />);

    // Welcome → Next
    await userEvent.click(screen.getByText("Next"));
    // Project step: fill the required fields.
    const nameInput = screen.getByPlaceholderText("My App");
    const pathInput = screen.getByPlaceholderText("/path/to/your/repo");
    await userEvent.type(nameInput, "Test Project");
    await userEvent.type(pathInput, "/tmp/test-repo");
    await userEvent.click(screen.getByText("Next"));
    // Settings → Next
    await userEvent.click(screen.getByText("Next"));
    // Agents → Next (no selection)
    await userEvent.click(screen.getByText("Next"));
    // First Task step — click Finish Setup which triggers the mutation.
    await userEvent.click(screen.getByText("Finish Setup"));

    // Error should be surfaced and onComplete should NOT fire.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert").textContent).toMatch(/Invalid repo path/);
    expect(onComplete).not.toHaveBeenCalled();
    // Still on the "First Task" step.
    expect(screen.getByText("Create Your First Task")).toBeInTheDocument();
  });
});
