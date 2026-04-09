import { useState, useEffect } from "react";
import { FormField } from "../shared/FormField.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";

interface ExecutionTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

export function ExecutionTab({ agent, projectId, updateAgent }: ExecutionTabProps) {
  const [maxTurns, setMaxTurns] = useState(agent.maxTurns.toString());
  const [maxConcurrentRuns, setMaxConcurrentRuns] = useState(agent.maxConcurrentRuns.toString());
  const [maxConcurrentTasks, setMaxConcurrentTasks] = useState(
    (agent.maxConcurrentTasks ?? 1).toString(),
  );
  const [maxConcurrentSubagents, setMaxConcurrentSubagents] = useState(
    (agent.maxConcurrentSubagents ?? 3).toString(),
  );
  const [heartbeatEnabled, setHeartbeatEnabled] = useState(agent.heartbeatEnabled);
  const [heartbeatIntervalSec, setHeartbeatIntervalSec] = useState(
    agent.heartbeatIntervalSec.toString(),
  );
  const [wakeOnAssignment, setWakeOnAssignment] = useState(agent.wakeOnAssignment);
  const [wakeOnOnDemand, setWakeOnOnDemand] = useState(agent.wakeOnOnDemand);
  const [wakeOnAutomation, setWakeOnAutomation] = useState(agent.wakeOnAutomation);
  const [workingHours, setWorkingHours] = useState(agent.workingHours ?? "");
  const [sessionCompactionEnabled, setSessionCompactionEnabled] = useState(
    agent.sessionCompactionEnabled ?? false,
  );
  const [sessionMaxRuns, setSessionMaxRuns] = useState(
    agent.sessionMaxRuns?.toString() ?? "",
  );
  const [sessionMaxInputTokens, setSessionMaxInputTokens] = useState(
    agent.sessionMaxInputTokens?.toString() ?? "",
  );
  const [sessionMaxAgeHours, setSessionMaxAgeHours] = useState(
    agent.sessionMaxAgeHours?.toString() ?? "",
  );

  useEffect(() => {
    setMaxTurns(agent.maxTurns.toString());
    setMaxConcurrentRuns(agent.maxConcurrentRuns.toString());
    setMaxConcurrentTasks((agent.maxConcurrentTasks ?? 1).toString());
    setMaxConcurrentSubagents((agent.maxConcurrentSubagents ?? 3).toString());
    setHeartbeatEnabled(agent.heartbeatEnabled);
    setHeartbeatIntervalSec(agent.heartbeatIntervalSec.toString());
    setWakeOnAssignment(agent.wakeOnAssignment);
    setWakeOnOnDemand(agent.wakeOnOnDemand);
    setWakeOnAutomation(agent.wakeOnAutomation);
    setWorkingHours(agent.workingHours ?? "");
    setSessionCompactionEnabled(agent.sessionCompactionEnabled ?? false);
    setSessionMaxRuns(agent.sessionMaxRuns?.toString() ?? "");
    setSessionMaxInputTokens(agent.sessionMaxInputTokens?.toString() ?? "");
    setSessionMaxAgeHours(agent.sessionMaxAgeHours?.toString() ?? "");
  }, [agent]);

  function handleSave() {
    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      maxTurns: parseInt(maxTurns, 10),
      maxConcurrentRuns: parseInt(maxConcurrentRuns, 10),
      maxConcurrentTasks: parseInt(maxConcurrentTasks, 10),
      maxConcurrentSubagents: parseInt(maxConcurrentSubagents, 10),
      heartbeatEnabled,
      heartbeatIntervalSec: parseInt(heartbeatIntervalSec, 10),
      wakeOnAssignment,
      wakeOnOnDemand,
      wakeOnAutomation,
      workingHours: workingHours || null,
      sessionCompactionEnabled,
      sessionMaxRuns: sessionMaxRuns ? parseInt(sessionMaxRuns, 10) : null,
      sessionMaxInputTokens: sessionMaxInputTokens ? parseInt(sessionMaxInputTokens, 10) : null,
      sessionMaxAgeHours: sessionMaxAgeHours ? parseInt(sessionMaxAgeHours, 10) : null,
    });
  }

  const inputClass =
    "w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none";

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Max Turns" description="Maximum turns per run">
          <input type="number" min={1} value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} className={inputClass} />
        </FormField>

        <FormField label="Max Concurrent Runs">
          <input type="number" min={1} value={maxConcurrentRuns} onChange={(e) => setMaxConcurrentRuns(e.target.value)} className={inputClass} />
        </FormField>

        <FormField label="Max Concurrent Tasks">
          <input type="number" min={1} value={maxConcurrentTasks} onChange={(e) => setMaxConcurrentTasks(e.target.value)} className={inputClass} />
        </FormField>

        <FormField label="Max Concurrent Subagents">
          <input type="number" min={0} value={maxConcurrentSubagents} onChange={(e) => setMaxConcurrentSubagents(e.target.value)} className={inputClass} />
        </FormField>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={heartbeatEnabled} onChange={(e) => setHeartbeatEnabled(e.target.checked)} className="rounded border-zinc-700" />
          Heartbeat Enabled
        </label>

        {heartbeatEnabled && (
          <FormField label="Heartbeat Interval (seconds)">
            <input type="number" min={0} value={heartbeatIntervalSec} onChange={(e) => setHeartbeatIntervalSec(e.target.value)} className={inputClass} />
          </FormField>
        )}
      </div>

      {heartbeatEnabled && (
        <div className="flex flex-col gap-3 rounded-lg border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={sessionCompactionEnabled}
              onChange={(e) => setSessionCompactionEnabled(e.target.checked)}
              className="rounded border-zinc-700"
            />
            Session Compaction
          </label>
          <p className="text-xs text-zinc-500">
            Rotate Claude Code sessions when thresholds are exceeded. Disabled by default — Claude Code handles compaction internally.
          </p>

          {sessionCompactionEnabled && (
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Max Runs" description="Rotate after N runs">
                <input
                  type="number"
                  min={0}
                  value={sessionMaxRuns}
                  onChange={(e) => setSessionMaxRuns(e.target.value)}
                  placeholder="No limit"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Max Input Tokens" description="Rotate at token threshold">
                <input
                  type="number"
                  min={0}
                  value={sessionMaxInputTokens}
                  onChange={(e) => setSessionMaxInputTokens(e.target.value)}
                  placeholder="No limit"
                  className={inputClass}
                />
              </FormField>

              <FormField label="Max Age (hours)" description="Rotate at age threshold">
                <input
                  type="number"
                  min={0}
                  value={sessionMaxAgeHours}
                  onChange={(e) => setSessionMaxAgeHours(e.target.value)}
                  placeholder="No limit"
                  className={inputClass}
                />
              </FormField>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-zinc-300">Wake Triggers</p>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={wakeOnAssignment} onChange={(e) => setWakeOnAssignment(e.target.checked)} className="rounded border-zinc-700" />
          Wake on Assignment
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={wakeOnOnDemand} onChange={(e) => setWakeOnOnDemand(e.target.checked)} className="rounded border-zinc-700" />
          Wake on On-Demand
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={wakeOnAutomation} onChange={(e) => setWakeOnAutomation(e.target.checked)} className="rounded border-zinc-700" />
          Wake on Automation
        </label>
      </div>

      <FormField label="Working Hours" description="e.g. 09:00-17:00 or leave blank for always-on">
        <input value={workingHours} onChange={(e) => setWorkingHours(e.target.value)} placeholder="Always on" className={inputClass} />
      </FormField>

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
