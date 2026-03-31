import { useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useCostSummary, useCostTimeseries } from "../../hooks/useCost.js";
import { useProject } from "../../hooks/useProjects.js";
import { BudgetGauge } from "./BudgetGauge.js";

interface CostDashboardProps {
  projectId: string | null;
}

export function CostDashboard({ projectId }: CostDashboardProps) {
  const [days, setDays] = useState(7);
  const { data: summary } = useCostSummary(projectId);
  const { data: timeseries } = useCostTimeseries(projectId, days);
  const { data: project } = useProject(projectId);

  return (
    <div className="flex flex-col gap-6">
      {/* Top row: total + gauge */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <span className="text-xs text-zinc-500">Total Spend</span>
          <p className="mt-1 text-2xl font-semibold text-zinc-100">
            ${summary?.total.toFixed(2) ?? "\u2014"}
          </p>
        </div>

        {project?.budgetLimitUsd != null && (
          <BudgetGauge
            label="Project Budget"
            spent={project.budgetSpentUsd ?? 0}
            limit={project.budgetLimitUsd}
          />
        )}
      </div>

      {/* Per-agent spend (bar chart) */}
      {summary && summary.byAgent.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">Per-Agent Spend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.byAgent}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="agentId" tick={{ fill: "#71717a", fontSize: 12 }} />
                <YAxis tick={{ fill: "#71717a", fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "6px" }}
                  labelStyle={{ color: "#a1a1aa" }}
                />
                <Bar dataKey="totalCost" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Agent table */}
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="pb-2">Agent</th>
                <th className="pb-2 text-right">Runs</th>
                <th className="pb-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary.byAgent.map((row) => (
                <tr key={row.agentId} className="border-t border-zinc-800">
                  <td className="py-1.5 text-zinc-300">{row.agentId}</td>
                  <td className="py-1.5 text-right text-zinc-400">{row.runCount}</td>
                  <td className="py-1.5 text-right text-zinc-300">${row.totalCost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Time-series spend */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Spend Over Time</h3>
          <div className="flex gap-1">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded px-2 py-1 text-xs ${
                  days === d ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeseries ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 12 }} />
              <YAxis tick={{ fill: "#71717a", fontSize: 12 }} tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "6px" }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Line type="monotone" dataKey="totalCost" stroke="#059669" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
