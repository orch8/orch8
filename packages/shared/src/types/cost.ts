/**
 * Shapes returned by the cost routes (packages/daemon/src/api/routes/cost.ts).
 * These mirror the JSON the daemon produces — dates are serialized as ISO
 * strings, numbers are plain numbers.
 */

export interface CostSummary {
  total: number;
  totalTokens: number;
  byAgent: Array<{
    agentId: string;
    totalCost: number;
    totalTokens: number;
    runCount: number;
  }>;
}

export interface CostTimeseriesPoint {
  date: string;
  agentId: string;
  totalCost: number;
  runCount: number;
}

export interface TaskCost {
  total: number;
  runs: Array<{
    id: string;
    agentId: string;
    costUsd: number | null;
    status: string;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
}
