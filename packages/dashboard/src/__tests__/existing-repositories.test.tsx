import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../test-utils.js";
import { ExistingRepositories } from "../components/onboarding/ExistingRepositories.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
beforeEach(() => mockFetch.mockReset());

it("reopens an active repository without creating another project", async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [
    { id: "one", slug: "my-app", name: "My App", homeDir: "/tmp/my-app", defaultBranch: "v2" },
    { id: "two", slug: "other", name: "Other", homeDir: "/tmp/other", defaultBranch: "main" },
  ] });
  const onOpen = vi.fn();
  renderWithProviders(<ExistingRepositories onOpen={onOpen} />);
  expect(await screen.findByText("/tmp/my-app · base v2")).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: /My App/ }));
  expect(onOpen).toHaveBeenCalledWith("my-app");
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch.mock.calls[0][0]).toContain("/api/projects?active=true");
});

it("shows a retry when the repository list cannot load", async () => {
  mockFetch.mockRejectedValueOnce(new Error("offline"));
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
  renderWithProviders(<ExistingRepositories onOpen={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load repositories");
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No repositories opened yet. Add one below.")).toBeInTheDocument();
});
