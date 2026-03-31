import { createFileRoute } from "@tanstack/react-router";
import { useAgents } from "../../../hooks/useAgents.js";
import { useTasks } from "../../../hooks/useTasks.js";
import { useCostSummary } from "../../../hooks/useCost.js";
import { useDaemonStatus } from "../../../hooks/useDaemon.js";
import { StatCard } from "../../../components/home/StatCard.js";
import { AlertsPanel } from "../../../components/home/AlertsPanel.js";
import { ActivityTimeline } from "../../../components/shared/ActivityTimeline.js";

function ProjectHomePage() {
  const { projectId } = Route.useParams();
  const { data: agents } = useAgents(projectId);
  const { data: tasks } = useTasks(projectId);
  const { data: costSummary } = useCostSummary(projectId);
  const { data: daemon } = useDaemonStatus();

  const activeAgents = agents?.filter((a) => a.status === "active") ?? [];
  const inProgressTasks = tasks?.filter((t) => t.column === "in_progress") ?? [];
  const reviewTasks = tasks?.filter((t) => t.column === "review") ?? [];
  const budgetWarning = costSummary ? costSummary.total > 0 : false;

  return (
    <div className="flex flex-col gap-6">
      {/* Top Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Active Agents"
          value={activeAgents.length}
          subtitle={`${agents?.length ?? 0} total`}
          indicator={activeAgents.length > 0 ? "green" : "none"}
        />
        <StatCard
          label="Tasks In Progress"
          value={inProgressTasks.length}
          subtitle={`${reviewTasks.length} in review`}
        />
        <StatCard
          label="Today's Spend"
          value={`$${(costSummary?.total ?? 0).toFixed(2)}`}
        />
        <StatCard
          label="Daemon"
          value={daemon?.status === "running" ? "Healthy" : "Unknown"}
          subtitle={daemon?.uptimeFormatted ? `Uptime: ${daemon.uptimeFormatted}` : undefined}
          indicator={daemon?.status === "running" ? "green" : "red"}
        />
      </div>

      {/* Main Content — 2 columns */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">Recent Activity</h3>
          <ActivityTimeline projectId={projectId} compact limit={10} />
        </div>
        <div>
          <AlertsPanel
            agents={agents ?? []}
            tasks={tasks ?? []}
            budgetWarning={budgetWarning}
          />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectHomePage,
});
