import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { ProjectSwitcher } from "../components/layout/ProjectSwitcher.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("ProjectSwitcher", () => {
  it("shows project list after loading", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          { id: "proj_1", name: "Alpha", slug: "alpha", active: true },
          { id: "proj_2", name: "Beta", slug: "beta", active: true },
        ]),
    });

    renderWithProviders(<ProjectSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument();
      expect(screen.getByText("Beta")).toBeInTheDocument();
    });
  });

  it("shows 'All Projects' option", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    });

    renderWithProviders(<ProjectSwitcher />);

    await waitFor(() => {
      expect(screen.getByText("All Projects")).toBeInTheDocument();
    });
  });
});
