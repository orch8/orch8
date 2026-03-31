import { useState, useMemo } from "react";
import { useTasks } from "../../hooks/useTasks.js";
import { useSpawnVerifier, useSpawnReferee } from "../../hooks/useVerification.js";
import type { Task } from "../../types.js";

type FilterTab = "all" | "awaiting" | "disputed" | "verifying" | "passed";

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting" },
  { key: "disputed", label: "Disputed" },
  { key: "verifying", label: "Verifying" },
  { key: "passed", label: "Passed" },
];

function getVerificationStatus(task: Task): FilterTab {
  if (task.verificationResult === "pass") return "passed";
  if (task.verificationResult === "fail") return "disputed";
  if (task.column === "verification") return "verifying";
  if (task.column === "review") return "awaiting";
  return "all";
}

interface ReviewQueueProps {
  projectId: string;
}

export function ReviewQueue({ projectId }: ReviewQueueProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const { data: allTasks } = useTasks(projectId);
  const spawnVerifier = useSpawnVerifier();
  const spawnReferee = useSpawnReferee();

  // Only tasks that are in review, verification, or done with verification result
  const reviewTasks = useMemo(() => {
    if (!allTasks) return [];
    return allTasks.filter(
      (t) =>
        t.column === "review" ||
        t.column === "verification" ||
        (t.column === "done" && t.verificationResult != null),
    );
  }, [allTasks]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return reviewTasks;
    return reviewTasks.filter((t) => getVerificationStatus(t) === activeTab);
  }, [reviewTasks, activeTab]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <p className="py-4 text-center text-sm text-zinc-600">No tasks in this category</p>
        )}
        {filtered.map((task) => {
          const status = getVerificationStatus(task);
          return (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-zinc-100">{task.title}</p>
                <p className="text-xs text-zinc-500">
                  {task.assignee ?? "Unassigned"} · {task.taskType}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                    status === "passed"
                      ? "bg-emerald-900/50 text-emerald-300"
                      : status === "disputed"
                        ? "bg-red-900/50 text-red-300"
                        : status === "verifying"
                          ? "bg-purple-900/50 text-purple-300"
                          : "bg-yellow-900/50 text-yellow-300"
                  }`}
                >
                  {status}
                </span>
                {status === "awaiting" && (
                  <button
                    onClick={() => spawnVerifier.mutate(task.id)}
                    disabled={spawnVerifier.isPending}
                    className="rounded bg-purple-600 px-2 py-1 text-xs font-medium text-white hover:bg-purple-500 disabled:opacity-40"
                  >
                    Spawn Verifier
                  </button>
                )}
                {status === "disputed" && (
                  <button
                    onClick={() => spawnReferee.mutate(task.id)}
                    disabled={spawnReferee.isPending}
                    className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    Spawn Referee
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
