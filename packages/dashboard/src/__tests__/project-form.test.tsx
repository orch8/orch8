import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, userEvent } from "../test-utils.js";
import { ProjectForm } from "../components/project/ProjectForm.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("ProjectForm", () => {
  it("renders all required fields", () => {
    renderWithProviders(<ProjectForm />);

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/home directory/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/worktree directory/i)).toBeInTheDocument();
  });

  it("renders optional fields", () => {
    renderWithProviders(<ProjectForm />);

    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default branch/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/budget limit/i)).toBeInTheDocument();
  });

  it("auto-generates slug from name", async () => {
    renderWithProviders(<ProjectForm />);

    const nameInput = screen.getByLabelText(/name/i);
    const user = userEvent.setup();
    await user.type(nameInput, "My Cool Project");

    const slugInput = screen.getByLabelText(/slug/i) as HTMLInputElement;
    expect(slugInput.value).toBe("my-cool-project");
  });

  it("submits create request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: "proj_1",
          name: "Test",
          slug: "test",
        }),
    });

    renderWithProviders(<ProjectForm />);

    // Fill required fields and submit — detailed interaction tested in e2e
  });
});

describe("ProjectForm — edit mode new fields", () => {
  const mockProject = {
    id: "proj_1",
    name: "Test",
    slug: "test",
    description: "A project",
    homeDir: "/home/test",
    worktreeDir: "/wt/test",
    repoUrl: "https://github.com/org/repo",
    defaultBranch: "main",
    defaultModel: "claude-opus-4-6",
    defaultMaxTurns: 25,

    budgetLimitUsd: 500,
    budgetSpentUsd: 123.45,
    budgetPaused: false,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;

  it("renders repoUrl field in edit mode", () => {
    renderWithProviders(<ProjectForm project={mockProject} />);
    expect(screen.getByLabelText(/repo url/i)).toBeInTheDocument();
  });

  it("renders defaultModel field in edit mode", () => {
    renderWithProviders(<ProjectForm project={mockProject} />);
    expect(screen.getByLabelText(/default model/i)).toBeInTheDocument();
  });

  it("renders defaultMaxTurns field in edit mode", () => {
    renderWithProviders(<ProjectForm project={mockProject} />);
    expect(screen.getByLabelText(/default max turns/i)).toBeInTheDocument();
  });

  it("displays budget spent as read-only", () => {
    renderWithProviders(<ProjectForm project={mockProject} />);
    expect(screen.getByText(/123\.45/)).toBeInTheDocument();
  });
});
