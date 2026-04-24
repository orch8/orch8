import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { TaskDetailPanel } from "../components/task-detail/TaskDetailPanel.js";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ projectSlug: "proj_1" }),
  useRouterState: ({ select }: any) =>
    select
      ? select({ location: { pathname: "/projects/proj_1/board" } })
      : "/projects/proj_1/board",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockTask = {
  id: "task_1",
  title: "Build auth",
  description: "Implement OAuth flow",
  taskType: "quick",
  column: "in_progress",
  priority: "high",
  assignee: "engineer",
  projectId: "proj_1",
  createdAt: "2026-03-30T00:00:00Z",
};

function mockTaskDetailResponses() {
  // The hooks fire in parallel via react-query, so provide enough
  // resolved values for all concurrent requests.
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve([]),
  });
  // useTask — GET /api/tasks/task_1
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(mockTask),
  });
  // useTaskCost — GET /api/cost/task/task_1?projectId=proj_1
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ total: 0.05 }),
  });
  // useTasks — GET /api/tasks?projectId=proj_1
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([mockTask]),
  });
  // useActivity — GET /api/log?projectId=proj_1&taskId=task_1&...
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([]),
  });
  // useComments — GET /api/tasks/task_1/comments
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve([]),
  });
}

describe("TaskDetailPanel", () => {
  it("renders task title and description", async () => {
    mockTaskDetailResponses();

    renderWithProviders(
      <TaskDetailPanel taskId="task_1" projectId="proj_1" onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Build auth")).toBeInTheDocument();
      expect(screen.getByText("Implement OAuth flow")).toBeInTheDocument();
    });
  });

  it("shows close button", async () => {
    mockTaskDetailResponses();

    renderWithProviders(
      <TaskDetailPanel taskId="task_1" projectId="proj_1" onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Close panel")).toBeInTheDocument();
    });
  });
});

