import { useState } from "react";
import { usePauseAgent, useResumeAgent, useUpdateAgent } from "../../hooks/useAgents.js";
import type { Agent } from "../../types.js";
import { GeneralTab } from "./GeneralTab.js";
import { ExecutionTab } from "./ExecutionTab.js";
import { PromptsTab } from "./PromptsTab.js";
import { SkillsToolsTab } from "./SkillsToolsTab.js";
import { PermissionsTab } from "./PermissionsTab.js";
import { BudgetTab } from "./BudgetTab.js";

const TABS = [
  "General",
  "Execution",
  "Prompts",
  "Skills & Tools",
  "Permissions",
  "Budget",
] as const;
type Tab = (typeof TABS)[number];

interface AgentSettingsPageProps {
  agent: Agent;
  projectId: string;
}

export function AgentSettingsPage({ agent, projectId }: AgentSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>("General");
  const pauseAgent = usePauseAgent();
  const resumeAgent = useResumeAgent();
  const updateAgent = useUpdateAgent();

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{agent.icon ?? "🤖"}</span>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">{agent.name}</h1>
            <p className="text-sm text-zinc-500">{agent.role} · {agent.model}</p>
          </div>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              agent.status === "active"
                ? "bg-emerald-900/50 text-emerald-300"
                : agent.status === "paused"
                  ? "bg-yellow-900/50 text-yellow-300"
                  : "bg-red-900/50 text-red-300"
            }`}
          >
            {agent.status}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {agent.status === "active" && (
            <button
              onClick={() =>
                pauseAgent.mutate({ agentId: agent.id, projectId })
              }
              className="rounded bg-yellow-900/30 px-3 py-1.5 text-sm text-yellow-300 hover:bg-yellow-900/50"
            >
              Pause
            </button>
          )}
          {agent.status === "paused" && (
            <button
              onClick={() =>
                resumeAgent.mutate({ agentId: agent.id, projectId })
              }
              className="rounded bg-emerald-900/30 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-900/50"
            >
              Resume
            </button>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-blue-500 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "General" && (
        <GeneralTab agent={agent} projectId={projectId} updateAgent={updateAgent} />
      )}
      {activeTab === "Execution" && (
        <ExecutionTab agent={agent} projectId={projectId} updateAgent={updateAgent} />
      )}
      {activeTab === "Prompts" && (
        <PromptsTab agent={agent} projectId={projectId} updateAgent={updateAgent} />
      )}
      {activeTab === "Skills & Tools" && (
        <SkillsToolsTab agent={agent} projectId={projectId} updateAgent={updateAgent} />
      )}
      {activeTab === "Permissions" && (
        <PermissionsTab agent={agent} projectId={projectId} updateAgent={updateAgent} />
      )}
      {activeTab === "Budget" && (
        <BudgetTab agent={agent} projectId={projectId} updateAgent={updateAgent} />
      )}
    </div>
  );
}
