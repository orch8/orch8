import { useState, useEffect } from "react";
import { FormField } from "../shared/FormField.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";

interface BudgetTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

export function BudgetTab({ agent, projectId, updateAgent }: BudgetTabProps) {
  const [budgetLimit, setBudgetLimit] = useState(agent.budgetLimitUsd?.toString() ?? "");
  const [autoPauseThreshold, setAutoPauseThreshold] = useState(
    (agent as any).autoPauseThreshold?.toString() ?? "",
  );

  useEffect(() => {
    setBudgetLimit(agent.budgetLimitUsd?.toString() ?? "");
    setAutoPauseThreshold((agent as any).autoPauseThreshold?.toString() ?? "");
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      budgetLimitUsd: budgetLimit ? parseFloat(budgetLimit) : null,
      autoPauseThreshold: autoPauseThreshold ? parseInt(autoPauseThreshold, 10) : null,
    });
  }

  const inputClass =
    "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none";

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <FormField label="Budget Limit (USD)" description="Lifetime cap on agent spend">
        <input
          type="number"
          min={0}
          step={0.01}
          value={budgetLimit}
          onChange={(e) => setBudgetLimit(e.target.value)}
          placeholder="No limit"
          className={inputClass}
        />
      </FormField>

      <FormField label="Auto-Pause Threshold (%)" description="Pause when reaching this percentage of budget limit">
        <input
          type="number"
          min={0}
          max={100}
          value={autoPauseThreshold}
          onChange={(e) => setAutoPauseThreshold(e.target.value)}
          placeholder="No threshold"
          className={inputClass}
        />
      </FormField>

      {/* Read-only displays */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-sm text-zinc-500">Budget Spent</span>
          <p className="text-sm text-zinc-300">${(agent.budgetSpentUsd ?? 0).toFixed(2)}</p>
        </div>
        <div>
          <span className="text-sm text-zinc-500">Budget Paused</span>
          <p className="text-sm text-zinc-300">{agent.budgetPaused ? "Yes" : "No"}</p>
        </div>
        {agent.pauseReason && (
          <div>
            <span className="text-sm text-zinc-500">Pause Reason</span>
            <p className="text-sm text-zinc-300">{agent.pauseReason}</p>
          </div>
        )}
      </div>

      {/* Budget progress bar */}
      {agent.budgetLimitUsd != null && (
        <div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{
                  width: `${Math.min(100, ((agent.budgetSpentUsd ?? 0) / agent.budgetLimitUsd) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-zinc-500">
              {((agent.budgetSpentUsd ?? 0) / agent.budgetLimitUsd * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={updateAgent.isPending}
        className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {updateAgent.isPending ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
