import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { MemoryBrowser } from "../components/memory/MemoryBrowser.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockEntities = [
  {
    id: "ent_1",
    projectId: "proj_1",
    slug: "auth-service",
    name: "Auth Service",
    entityType: "project",
    description: "Authentication service docs",
  },
  {
    id: "ent_2",
    projectId: "proj_1",
    slug: "api-design",
    name: "API Design",
    entityType: "area",
    description: "API design decisions",
  },
];

describe("MemoryBrowser", () => {
  it("renders entity list", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEntities),
    });

    renderWithProviders(<MemoryBrowser projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("Auth Service")).toBeInTheDocument();
      expect(screen.getByText("API Design")).toBeInTheDocument();
    });
  });

  it("renders entity type filters", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockEntities),
    });

    renderWithProviders(<MemoryBrowser projectId="proj_1" />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Area")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
  });

  it("renders search input", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithProviders(<MemoryBrowser projectId="proj_1" />);

    expect(
      screen.getByPlaceholderText("Search facts..."),
    ).toBeInTheDocument();
  });
});
