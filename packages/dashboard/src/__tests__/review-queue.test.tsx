import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { ReviewQueue } from "../components/review/ReviewQueue.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const mockTasks = [
  { id: "t1", title: "Auth flow", column: "review", taskType: "quick", verificationResult: null, assignee: "eng-1", projectId: "proj_1" },
  { id: "t2", title: "Dashboard", column: "verification", taskType: "complex", verificationResult: "fail", assignee: "eng-2", projectId: "proj_1" },
  { id: "t3", title: "API layer", column: "done", taskType: "quick", verificationResult: "pass", assignee: "eng-1", projectId: "proj_1" },
];

describe("ReviewQueue", () => {
  it("renders filter tabs", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockTasks) });
    renderWithProviders(<ReviewQueue projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("All")).toBeInTheDocument();
      expect(screen.getByText("Awaiting")).toBeInTheDocument();
      expect(screen.getByText("Disputed")).toBeInTheDocument();
      expect(screen.getByText("Passed")).toBeInTheDocument();
    });
  });

  it("renders task rows", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockTasks) });
    renderWithProviders(<ReviewQueue projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("Auth flow")).toBeInTheDocument();
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
    });
  });

  it("shows Spawn Verifier button for awaiting tasks", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockTasks) });
    renderWithProviders(<ReviewQueue projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("Auth flow")).toBeInTheDocument();
    });

    // Auth flow is in review with no verification result = awaiting
    expect(screen.getAllByText("Spawn Verifier").length).toBeGreaterThan(0);
  });
});
