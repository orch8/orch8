import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
const catalog = ["implementer", "reviewer", "cto", "qa", "planner", "researcher"].map(id => ({
  id, name: id.toUpperCase(), role: id, model: "claude-sonnet-4-6", maxTurns: 100,
  skills: [], heartbeatEnabled: id === "cto" || id === "qa",
}));
let failingPath: string | undefined;
beforeEach(() => {
  failingPath = undefined;
  mockFetch.mockReset();
  mockFetch.mockImplementation((input: string, init?: RequestInit) => {
    const post = init?.method === "POST";
    const failed = post && input.endsWith(failingPath ?? "never");
    const data = input.endsWith("/bundled-agents") && !post ? catalog : { id: "proj_fixture", slug: "factory" };
    return Promise.resolve({ ok: !failed, status: failed ? 400 : 200,
      json: async () => data, text: async () => failed ? "Fixture failure" : JSON.stringify(data) });
  });
});
async function projectStep() {
  await userEvent.type(screen.getByPlaceholderText("My App"), "Factory");
  await userEvent.type(screen.getByPlaceholderText("/path/to/your/repo"), "/tmp/factory");
  await userEvent.click(screen.getByText("Next"));
  await screen.findByText("IMPLEMENTER");
}
const posts = () => mockFetch.mock.calls.filter(([, init]) => init?.method === "POST");

describe("WelcomeWizard", () => {
  it("offers only Welcome, Project, Agents and First Task in order", async () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} />);
    expect(screen.getByText("Welcome to orch8")).toBeInTheDocument();
    expect(screen.queryByText("Setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Create Project")).toBeInTheDocument();
    expect(screen.queryByText("Help me set up")).not.toBeInTheDocument();
    expect(screen.queryByText("Verification Required")).not.toBeInTheDocument();
    await projectStep();
    expect(screen.getByText("REVIEWER")).toBeInTheDocument();
    for (const name of ["CTO", "QA", "PLANNER", "RESEARCHER", "Selected"]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Create Your First Task")).toBeInTheDocument();
  });

  it("starts at Project without intro and permits skipping agents and task without chat POST", async () => {
    const complete = vi.fn();
    renderWithProviders(<WelcomeWizard showIntro={false} onComplete={complete} />);
    expect(screen.queryByText("Welcome")).not.toBeInTheDocument();
    await projectStep();
    await userEvent.click(screen.getByText("Next"));
    await userEvent.click(screen.getByText("Finish Setup"));
    await waitFor(() => expect(complete).toHaveBeenCalledWith("factory"));
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/projects");
  });

  it("installs only selected roles and creates an unassigned quick task", async () => {
    const complete = vi.fn();
    renderWithProviders(<WelcomeWizard showIntro={false} onComplete={complete} />);
    await projectStep();
    await userEvent.click(screen.getByText("IMPLEMENTER"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.type(screen.getByPlaceholderText("Build the authentication flow"), "  Check login  ");
    await userEvent.click(screen.getByText("Finish Setup"));
    await waitFor(() => expect(complete).toHaveBeenCalledWith("factory"));
    expect(posts()).toHaveLength(3);
    expect(JSON.parse(posts()[1][1].body)).toEqual({ projectId: "proj_fixture", agentIds: ["implementer"] });
    expect(JSON.parse(posts()[2][1].body)).toEqual({ projectId: "proj_fixture", title: "Check login", taskType: "quick", priority: "medium" });
    expect(posts().some(([url]) => url.includes("/chats"))).toBe(false);
  });

  it.each(["/api/projects", "/bundled-agents/add", "/tasks"])("shows failures at %s without completing", async (path) => {
    failingPath = path;
    const complete = vi.fn();
    renderWithProviders(<WelcomeWizard showIntro={false} onComplete={complete} />);
    await projectStep();
    await userEvent.click(screen.getByText("IMPLEMENTER"));
    await userEvent.click(screen.getByText("Next"));
    await userEvent.type(screen.getByPlaceholderText("Build the authentication flow"), "Check login");
    await userEvent.click(screen.getByText("Finish Setup"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Fixture failure");
    expect(complete).not.toHaveBeenCalled();
    expect(screen.getByText("Create Your First Task")).toBeInTheDocument();
  });
});
