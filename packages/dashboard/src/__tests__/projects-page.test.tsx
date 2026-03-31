import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { ProjectsPage } from "../routes/projects.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockProjects = [
  {
    id: "proj_1",
    name: "My App",
    slug: "my-app",
    homeDir: "/code/my-app",
    active: true,
    budgetLimitUsd: 100,
    budgetSpentUsd: 42.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "proj_2",
    name: "Library",
    slug: "library",
    homeDir: "/code/library",
    active: false,
    budgetLimitUsd: null,
    budgetSpentUsd: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("ProjectsPage", () => {
  it("renders project cards", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProjects),
    });
    renderWithProviders(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("My App")).toBeInTheDocument();
      expect(screen.getByText("Library")).toBeInTheDocument();
    });
  });

  it("shows active/archived badges", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProjects),
    });
    renderWithProviders(<ProjectsPage />);

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Archived")).toBeInTheDocument();
    });
  });

  it("renders new project button", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });
    renderWithProviders(<ProjectsPage />);

    expect(screen.getByText("+ New Project")).toBeInTheDocument();
  });
});
