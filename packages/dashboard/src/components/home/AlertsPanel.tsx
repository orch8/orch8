import type { Agent, Task } from "../../types.js";

interface AlertsPanelProps {
  agents: Agent[];
  tasks: Task[];
  budgetWarning: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  paused: "bg-yellow-500",
  terminated: "bg-red-500",
};

export function AlertsPanel({ agents, tasks, budgetWarning }: AlertsPanelProps) {
  // Derive alerts from current state
  const stuckTasks = tasks.filter(
    (t) => t.column === "blocked" && !t.assignee,
  );
  const failedAgents = agents.filter((a) => a.status === "paused" && a.pauseReason);

  return (
    <div className="flex flex-col gap-4">
      {/* Active Alerts */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Alerts
        </h3>
        <div className="flex flex-col gap-1">
          {budgetWarning && (
            <div className="rounded-md border border-yellow-800/50 bg-yellow-900/20 px-3 py-2 text-sm text-yellow-300">
              Budget warning: approaching daily limit
            </div>
          )}
          {stuckTasks.map((task) => (
            <div
              key={task.id}
              className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300"
            >
              Stuck: {task.title} — blocked with no assignee
            </div>
          ))}
          {failedAgents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-md border border-red-800/50 bg-red-900/20 px-3 py-2 text-sm text-red-300"
            >
              Agent paused: {agent.name} — {agent.pauseReason}
            </div>
          ))}
          {!budgetWarning && stuckTasks.length === 0 && failedAgents.length === 0 && (
            <p className="text-xs text-zinc-600">No active alerts</p>
          )}
        </div>
      </div>

      {/* Agent Status */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Agent Status
        </h3>
        <div className="flex flex-col gap-1">
          {agents.length === 0 && (
            <p className="text-xs text-zinc-600">No agents configured</p>
          )}
          {agents.map((agent) => {
            const currentTask = tasks.find(
              (t) => t.executionAgentId === agent.id && t.column === "in_progress",
            );
            return (
              <div
                key={agent.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_COLORS[agent.status] ?? "bg-zinc-500"}`}
                />
                <span className="font-medium text-zinc-300">{agent.name}</span>
                <span className="text-xs text-zinc-500">{agent.status}</span>
                {currentTask && (
                  <span className="ml-auto truncate text-xs text-zinc-500">
                    → {currentTask.title}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
