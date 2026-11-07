import { beforeEach, expect, it, vi } from "vitest";
import { renderWithProviders, screen, userEvent } from "../test-utils.js";
import { ExistingRepositories } from "../components/onboarding/ExistingRepositories.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
beforeEach(() => { mockFetch.mockReset(); });
const response = (value: unknown) => ({ ok: true, json: async () => value });

it("reopens an existing checkout without creating another project", async () => {
  mockFetch.mockImplementation((url: string) => Promise.resolve(response(
    String(url).includes("/api/pipelines") ? [] : [
      { id: "one", slug: "my-app", name: "My App", homeDir: "/tmp/my-app", defaultBranch: "v2" },
      { id: "two", slug: "other", name: "Other", homeDir: "/tmp/other", defaultBranch: "main" },
    ],
  )));
  const onOpen = vi.fn();
  renderWithProviders(<ExistingRepositories onOpen={onOpen} onResume={vi.fn()} />);
  expect(await screen.findByText("/tmp/my-app · base v2")).toBeInTheDocument();
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Open repository" })[0]);
  expect(onOpen).toHaveBeenCalledWith("my-app");
  expect(mockFetch.mock.calls[0][0]).toContain("/api/projects?active=true");
});

it("shows the newest unfinished workflow and its plan decision, then resumes that exact workflow", async () => {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/projects?")) return Promise.resolve(response([
      { id: "one", slug: "my-app", name: "My App", homeDir: "/tmp/my-app", defaultBranch: "v2" },
    ]));
    if (url.includes("/api/pipelines/new")) return Promise.resolve(response({ steps: [
      { label: "Plan", status: "awaiting_verification" },
    ] }));
    if (url.includes("/api/pipelines?")) return Promise.resolve(response([
      { id: "old", projectId: "one", name: "Old feature", status: "running", createdAt: "2026-01-01T00:00:00Z" },
      { id: "new", projectId: "one", name: "Export report", status: "running", createdAt: "2026-02-01T00:00:00Z" },
      { id: "done", projectId: "one", name: "Finished feature", status: "completed", createdAt: "2026-03-01T00:00:00Z" },
    ]));
    throw new Error(`Unexpected request: ${url}`);
  });
  const onResume = vi.fn();
  renderWithProviders(<ExistingRepositories onOpen={vi.fn()} onResume={onResume} />);
  expect(await screen.findByText("Export report · Your decision needed: Plan")).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole("button", { name: "Continue workflow" }));
  expect(onResume).toHaveBeenCalledWith("my-app", "new");
  expect(screen.queryByText(/Finished feature/)).not.toBeInTheDocument();
});

it("does not disguise an unavailable workflow decision as a normal pending step", async () => {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/projects?")) return Promise.resolve(response([
      { id: "one", slug: "my-app", name: "My App", homeDir: "/tmp/my-app", defaultBranch: "v2" },
    ]));
    if (url.includes("/api/pipelines?")) return Promise.resolve(response([
      { id: "plan", projectId: "one", name: "Write docs", status: "running", createdAt: "2026-02-01T00:00:00Z" },
    ]));
    if (url.includes("/api/pipelines/plan")) return Promise.resolve({ ok: false, status: 503, text: async () => "offline" });
    throw new Error(`Unexpected request: ${url}`);
  });
  renderWithProviders(<ExistingRepositories onOpen={vi.fn()} onResume={vi.fn()} />);
  expect(await screen.findByText("Write docs · Step status unavailable; open workflow to inspect it")).toBeInTheDocument();
});

it("shows a retry when the repository list cannot load", async () => {
  mockFetch.mockRejectedValueOnce(new Error("offline"));
  mockFetch.mockResolvedValueOnce(response([]));
  renderWithProviders(<ExistingRepositories onOpen={vi.fn()} onResume={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load repositories");
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No repositories opened yet. Add one below.")).toBeInTheDocument();
});
