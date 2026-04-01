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
      ? select({ location: { pathname: "/projects/proj_1" } })
      : "/projects/proj_1",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

function mockApiResponses() {
  // agents
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve([
        { id: "eng-1", name: "Engineer", status: "active", projectId: "proj_1", role: "implementer", pauseReason: null },
      ]),
  });
  // tasks
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve([
        { id: "task_1", title: "Auth", column: "in_progress", projectId: "proj_1", executionAgentId: "eng-1" },
        { id: "task_2", title: "Done task", column: "done", projectId: "proj_1" },
      ]),
  });
  // cost summary
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ total: 12.5, byAgent: [] }),
  });
  // daemon status
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({ status: "running", pid: 123, uptimeMs: 60000, uptimeFormatted: "1m 0s", processCount: 1, queueDepth: 0, tickIntervalMs: 5000 }),
  });
  // activity log (ActivityTimeline)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([]),
  });
}

// Import the route module after mocks are set up (vi.mock is hoisted)
import { Route as HomeRoute } from "../routes/projects/$projectId/index.js";

const ProjectHomePage = (HomeRoute as any).component;

describe("ProjectHomePage", () => {
  it("renders stat cards", async () => {
    mockApiResponses();
    renderWithProviders(<ProjectHomePage />);

    await waitFor(() => {
      expect(screen.getByText("Active Agents")).toBeInTheDocument();
      expect(screen.getByText("Tasks In Progress")).toBeInTheDocument();
      expect(screen.getByText("Today's Spend")).toBeInTheDocument();
      expect(screen.getByText("Daemon")).toBeInTheDocument();
    });
  });

  it("renders recent activity section", async () => {
    mockApiResponses();
    renderWithProviders(<ProjectHomePage />);

    await waitFor(() => {
      expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    });
  });

  it("renders alerts and agent status section", async () => {
    mockApiResponses();
    renderWithProviders(<ProjectHomePage />);

    await waitFor(() => {
      expect(screen.getByText("Alerts")).toBeInTheDocument();
      expect(screen.getByText("Agent Status")).toBeInTheDocument();
    });
  });
});
