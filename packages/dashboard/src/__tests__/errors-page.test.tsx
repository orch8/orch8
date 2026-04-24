import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";

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
      ? select({ location: { pathname: "/projects/proj_1/errors" } })
      : "/projects/proj_1/errors",
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const now = new Date("2026-04-24T12:00:00.000Z").toISOString();

const mockErrors = [
  {
    id: "err_1",
    projectId: "proj_1",
    agentId: "agent_1",
    taskId: "task_1",
    runId: "run_1",
    chatId: null,
    requestId: "req_1",
    severity: "error",
    source: "provider",
    code: "provider.auth_required",
    message: "Provider authentication failed",
    stack: "Error: Provider authentication failed",
    cause: null,
    metadata: { adapter: "claude" },
    httpMethod: null,
    httpPath: null,
    httpStatus: null,
    actorType: "system",
    actorId: null,
    fingerprint: "abc",
    occurrences: 3,
    firstSeenAt: now,
    lastSeenAt: now,
    resolvedAt: null,
    resolvedBy: null,
    occurredAt: now,
    createdAt: now,
  },
];

const mockSummary = [
  { source: "provider", severity: "error", count: 3 },
  { source: "api", severity: "warn", count: 2 },
];

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (url.startsWith("/api/errors/summary")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSummary) });
    }
    if (url === "/api/errors/err_1/resolve" && options?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ...mockErrors[0], resolvedAt: now, resolvedBy: "dashboard" }),
      });
    }
    if (url.startsWith("/api/errors")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockErrors) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
});

import { Route as ErrorsRoute } from "../routes/projects/$projectId/errors.js";

const ErrorsPage = (ErrorsRoute as any).component;

describe("ErrorsPage", () => {
  it("renders summary stats and error rows", async () => {
    renderWithProviders(<ErrorsPage />);

    await waitFor(() => {
      expect(screen.getByText("Provider authentication failed")).toBeInTheDocument();
    });

    expect(screen.getByText("provider.auth_required")).toBeInTheDocument();
    expect(screen.getByText("provider")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Filter by severity")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by source")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by code")).toBeInTheDocument();
  });

  it("sends project-scoped resolve requests", async () => {
    const { user } = renderWithProviders(<ErrorsPage />);

    await waitFor(() => {
      expect(screen.getByText("Resolve")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Resolve"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/errors/err_1/resolve",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ resolvedBy: "dashboard" }),
        }),
      );
    });
  });
});
