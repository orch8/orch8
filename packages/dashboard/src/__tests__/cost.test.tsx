import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { CostDashboard } from "../components/cost/CostDashboard.js";
import { BudgetGauge } from "../components/cost/BudgetGauge.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock recharts to avoid rendering issues in happy-dom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Bar: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
  Legend: () => null,
}));

beforeEach(() => mockFetch.mockReset());

const mockSummary = {
  total: 15.5,
  totalTokens: 34500,
  byAgent: [
    { agentId: "eng", totalCost: 10.0, runCount: 25 },
    { agentId: "qa", totalCost: 5.5, runCount: 12 },
  ],
};

const mockTimeseries = [
  { date: "2026-03-25", agentId: "eng", totalCost: 2.0, runCount: 5 },
  { date: "2026-03-26", agentId: "eng", totalCost: 3.0, runCount: 7 },
];

describe("BudgetGauge", () => {
  it("renders label and amounts", () => {
    renderWithProviders(
      <BudgetGauge label="Project Budget" spent={7.5} limit={20} />,
    );

    expect(screen.getByText("Project Budget")).toBeInTheDocument();
    expect(screen.getByText("$7.50 / $20.00")).toBeInTheDocument();
  });

  it("shows percentage", () => {
    renderWithProviders(
      <BudgetGauge label="Agent Budget" spent={5} limit={10} />,
    );

    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});

describe("CostDashboard", () => {
  it("renders total cost", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummary),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTimeseries),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ budgetLimitUsd: 100, budgetSpentUsd: 15.5 }),
      });

    renderWithProviders(<CostDashboard projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("$15.50")).toBeInTheDocument();
    });
  });

  it("renders total tokens next to total cost", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummary),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTimeseries),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ budgetLimitUsd: 100, budgetSpentUsd: 15.5 }),
      });

    renderWithProviders(<CostDashboard projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("Total Tokens")).toBeInTheDocument();
      expect(screen.getByText("34,500")).toBeInTheDocument();
    });
  });

  it("renders agent cost breakdown", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSummary),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTimeseries),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ budgetLimitUsd: 100, budgetSpentUsd: 15.5 }),
      });

    renderWithProviders(<CostDashboard projectId="proj_1" />);

    await waitFor(() => {
      expect(screen.getByText("eng")).toBeInTheDocument();
      expect(screen.getByText("qa")).toBeInTheDocument();
    });
  });
});
