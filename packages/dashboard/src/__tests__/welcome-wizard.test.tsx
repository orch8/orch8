import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("WelcomeWizard", () => {
  it("renders welcome step first", () => {
    renderWithProviders(<WelcomeWizard onComplete={(_projectId) => {}} onChatNavigate={() => {}} />);
    expect(screen.getByText("Welcome to orch8")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("advances to path selection step after welcome", async () => {
    renderWithProviders(<WelcomeWizard onComplete={(_projectId) => {}} onChatNavigate={() => {}} />);
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How would you like to get started?")).toBeInTheDocument();
  });

  it("shows initial step labels including setup step", () => {
    renderWithProviders(<WelcomeWizard onComplete={(_projectId) => {}} onChatNavigate={() => {}} />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Setup")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    // Before path is chosen, setupPath is null so Agents/First Task are included
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("First Task")).toBeInTheDocument();
  });

  it("shows path selection step after welcome", async () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} onChatNavigate={() => {}} />);
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How would you like to get started?")).toBeInTheDocument();
    expect(screen.getByText("I know what I need")).toBeInTheDocument();
    expect(screen.getByText("Help me set up")).toBeInTheDocument();
  });

  it("conversational path shows only 4 step labels", async () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} onChatNavigate={() => {}} />);
    // Welcome → Next
    await userEvent.click(screen.getByText("Next"));
    // Click "Help me set up"
    await userEvent.click(screen.getByText("Help me set up"));
    // Should now be on Project step, with only 4 steps visible
    expect(screen.getByText("Create Project")).toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("First Task")).not.toBeInTheDocument();
  });

  it("manual path shows all 6 step labels", async () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} onChatNavigate={() => {}} />);
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("I know what I need"));
    expect(screen.getByText("Create Project")).toBeInTheDocument();
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
    renderWithProviders(<WelcomeWizard onComplete={onComplete} onChatNavigate={() => {}} />);

    // Welcome → Next
    await userEvent.click(screen.getByText("Next"));
    // Setup → choose manual path
    await userEvent.click(screen.getByText("I know what I need"));
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

  it("cannot advance past Setup step without choosing a path", async () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} onChatNavigate={() => {}} />);
    // Welcome → Next (now on Setup step)
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("How would you like to get started?")).toBeInTheDocument();

    // Clicking "Next" without choosing a path should be a no-op (guarded in handleStepChange)
    await userEvent.click(screen.getByText("Next"));
    // Still on Setup step — the Project step heading should NOT be visible
    expect(screen.getByText("How would you like to get started?")).toBeInTheDocument();
    expect(screen.queryByText("Create Project")).not.toBeInTheDocument();
  });

  it("manual path creates project and calls onComplete with the project slug", async () => {
    const projectId = "proj_manual_1";
    const projectSlug = "manual-project";

    mockFetch.mockImplementation((input: any, init?: RequestInit) => {
      const url = String(input ?? "");
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/projects") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify({ id: projectId, slug: projectSlug })),
          json: () => Promise.resolve({ id: projectId, slug: projectSlug }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("[]"),
        json: () => Promise.resolve([]),
      });
    });

    const onComplete = vi.fn();
    const onChatNavigate = vi.fn();
    renderWithProviders(
      <WelcomeWizard onComplete={onComplete} onChatNavigate={onChatNavigate} />,
    );

    // Welcome → Next
    await userEvent.click(screen.getByText("Next"));
    // Setup → choose manual path
    await userEvent.click(screen.getByText("I know what I need"));
    // Project step: fill required fields
    await userEvent.type(screen.getByPlaceholderText("My App"), "Manual Project");
    await userEvent.type(screen.getByPlaceholderText("/path/to/your/repo"), "/tmp/manual");
    await userEvent.click(screen.getByText("Next"));
    // Settings → Next
    await userEvent.click(screen.getByText("Next"));
    // Agents → Next (no selection)
    await userEvent.click(screen.getByText("Next"));
    // First Task step → Finish Setup (no task title — that's allowed)
    await userEvent.click(screen.getByText("Finish Setup"));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(projectSlug);
    });
    // onChatNavigate should NOT be called for the manual path
    expect(onChatNavigate).not.toHaveBeenCalled();
  });

  it("conversational path creates project and chat, then calls onChatNavigate", async () => {
    const projectId = "proj_test123";
    const projectSlug = "test-project";
    const chatId = "chat_test456";

    mockFetch.mockImplementation((input: any, init?: RequestInit) => {
      const url = String(input ?? "");
      const method = (init?.method ?? "GET").toUpperCase();

      // Chat creation — must be checked before project creation since the URL
      // (/api/projects/:id/chats) also contains "/api/projects".
      if (url.includes("/chats") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify({ id: chatId, projectId })),
          json: () => Promise.resolve({ id: chatId, projectId }),
        });
      }
      if (url.includes("/api/projects") && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          text: () => Promise.resolve(JSON.stringify({ id: projectId, slug: projectSlug })),
          json: () => Promise.resolve({ id: projectId, slug: projectSlug }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve("[]"),
        json: () => Promise.resolve([]),
      });
    });

    const onComplete = vi.fn();
    const onChatNavigate = vi.fn();
    renderWithProviders(
      <WelcomeWizard onComplete={onComplete} onChatNavigate={onChatNavigate} />,
    );

    // Welcome → Next
    await userEvent.click(screen.getByText("Next"));
    // Choose "Help me set up"
    await userEvent.click(screen.getByText("Help me set up"));
    // Project step: fill required fields
    await userEvent.type(screen.getByPlaceholderText("My App"), "Test Project");
    await userEvent.type(screen.getByPlaceholderText("/path/to/your/repo"), "/tmp/test");
    await userEvent.click(screen.getByText("Next"));
    // Settings step — this is the last step, click Finish Setup
    await userEvent.click(screen.getByText("Finish Setup"));

    await waitFor(() => {
      expect(onChatNavigate).toHaveBeenCalledWith(projectSlug, chatId);
    });
    // onComplete should NOT be called for the conversational path
    expect(onComplete).not.toHaveBeenCalled();
  });
});
