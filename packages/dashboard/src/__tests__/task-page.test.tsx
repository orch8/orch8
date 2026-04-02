import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { TaskPage } from "../components/task-page/TaskPage.js";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectId: "proj_1" }),
  useRouterState: ({ select }: any) =>
    select
      ? select({ location: { pathname: "/projects/proj_1/board" } })
      : "/projects/proj_1/board",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockTask = {
  id: "task_1",
  projectId: "proj_1",
  title: "Fix authentication bug",
  description: "Users are getting logged out randomly",
  column: "in_progress",
  taskType: "quick",
  assignee: "eng-1",
  priority: "high",
  brainstormStatus: null,
  autoCommit: false,
  autoPr: true,
  branch: "feat/fix-auth",
  worktreePath: "/tmp/wt/fix-auth",

  mcpTools: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as any;

beforeEach(() => {
  mockFetch.mockReset();
  // Default: resolve all fetches with empty arrays/objects
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
});

describe("TaskPage", () => {
  it("renders task title", () => {
    renderWithProviders(<TaskPage task={mockTask} projectId="proj_1" />);
    expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
  });

  it("renders four tab labels", () => {
    renderWithProviders(<TaskPage task={mockTask} projectId="proj_1" />);
    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders sidebar metadata", () => {
    renderWithProviders(<TaskPage task={mockTask} projectId="proj_1" />);
    expect(screen.getByText("in_progress")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("quick")).toBeInTheDocument();
    expect(screen.getByText("eng-1")).toBeInTheDocument();
  });
});
