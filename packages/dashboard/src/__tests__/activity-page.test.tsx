import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";

// Mock router — createFileRoute returns a function that returns an object with useParams
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (opts: any) => ({
    ...opts,
    useParams: () => ({ projectId: "proj_1" }),
    useSearch: () => ({}),
  }),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: any) =>
    select
      ? select({ location: { pathname: "/projects/proj_1/activity" } })
      : "/projects/proj_1/activity",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockEntries = [
  { id: 1, projectId: "proj_1", agentId: "eng-1", taskId: "task_1", runId: null, message: "Task transitioned to in_progress", level: "info", createdAt: new Date().toISOString() },
  { id: 2, projectId: "proj_1", agentId: null, taskId: null, runId: null, message: "Budget warning at 80%", level: "warn", createdAt: new Date().toISOString() },
  { id: 3, projectId: "proj_1", agentId: "eng-1", taskId: null, runId: "run_1", message: "Run failed: exit code 1", level: "error", createdAt: new Date().toISOString() },
];

// Import the route module after mocks are set up (vi.mock is hoisted)
import { Route as ActivityRoute } from "../routes/projects/$projectId/activity.js";

const ActivityPage = (ActivityRoute as any).component;

describe("ActivityPage", () => {
  it("renders activity entries with timestamps", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries) });
    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("Task transitioned to in_progress")).toBeInTheDocument();
      expect(screen.getByText("Budget warning at 80%")).toBeInTheDocument();
    });
  });

  it("renders level filter dropdown", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) });
    renderWithProviders(<ActivityPage />);

    expect(screen.getByLabelText("Filter by level")).toBeInTheDocument();
  });

  it("renders pagination controls", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockEntries) });
    renderWithProviders(<ActivityPage />);

    await waitFor(() => {
      expect(screen.getByText("Older")).toBeInTheDocument();
    });
  });
});
