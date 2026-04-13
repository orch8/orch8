import { useState, useEffect } from "react";
import { useDaemonConfig, useUpdateDaemonConfig, useRestartDaemon, type DaemonConfig } from "../../hooks/useDaemon.js";
import { FormField } from "../shared/FormField.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";

const TABS = ["General", "Daemon", "Concurrency", "Database", "Memory"] as const;
type Tab = (typeof TABS)[number];

export function SettingsPage() {
  const { data: config, isLoading } = useDaemonConfig();
  const updateConfig = useUpdateDaemonConfig();
  const restartDaemon = useRestartDaemon();
  const [activeTab, setActiveTab] = useState<Tab>("General");
  const [draft, setDraft] = useState<DaemonConfig | null>(null);
  const [showRestart, setShowRestart] = useState(false);

  useEffect(() => {
    if (config && !draft) setDraft(config);
  }, [config, draft]);

  if (isLoading || !draft) {
    return <p className="text-sm text-zinc-600">Loading settings...</p>;
  }

  function handleSaveAndRestart() {
    setShowRestart(true);
  }

  function confirmRestart() {
    updateConfig.mutate({ ...draft, restart: true } as any);
    setShowRestart(false);
  }

  function handleSave() {
    updateConfig.mutate(draft as any);
  }

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
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
      <div className="max-w-xl">
        {activeTab === "General" && (
          <div className="flex flex-col gap-[var(--gap-block)]">
            <FormField label="Default Model">
              <input
                value={draft.defaults.model}
                onChange={(e) =>
                  setDraft({ ...draft, defaults: { ...draft.defaults, model: e.target.value } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
            <FormField label="Max Turns per Run">
              <input
                type="number"
                min={1}
                value={draft.defaults.max_turns}
                onChange={(e) =>
                  setDraft({ ...draft, defaults: { ...draft.defaults, max_turns: parseInt(e.target.value) || 180 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
            <FormField label="Auto-Commit">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.defaults.auto_commit}
                  onChange={(e) =>
                    setDraft({ ...draft, defaults: { ...draft.defaults, auto_commit: e.target.checked } })
                  }
                />
                Automatically commit after agent completes
              </label>
            </FormField>
            <FormField label="Auto-PR">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.defaults.auto_pr}
                  onChange={(e) =>
                    setDraft({ ...draft, defaults: { ...draft.defaults, auto_pr: e.target.checked } })
                  }
                />
                Automatically create PR after task completion
              </label>
            </FormField>
            <FormField label="Verification Required">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.defaults.verification_required}
                  onChange={(e) =>
                    setDraft({ ...draft, defaults: { ...draft.defaults, verification_required: e.target.checked } })
                  }
                />
                Require verification before marking tasks done
              </label>
            </FormField>
            <FormField label="Brainstorm Idle Timeout (minutes)">
              <input
                type="number"
                min={0}
                value={draft.defaults.brainstorm_idle_timeout_min}
                onChange={(e) =>
                  setDraft({ ...draft, defaults: { ...draft.defaults, brainstorm_idle_timeout_min: parseInt(e.target.value) || 30 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
          </div>
        )}

        {activeTab === "Daemon" && (
          <div className="flex flex-col gap-[var(--gap-block)]">
            <FormField label="Tick Interval (ms)">
              <input
                type="number"
                min={1000}
                value={draft.orchestrator.tick_interval_ms}
                onChange={(e) =>
                  setDraft({ ...draft, orchestrator: { ...draft.orchestrator, tick_interval_ms: parseInt(e.target.value) || 5000 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
            <FormField label="Log Level">
              <select
                value={draft.orchestrator.log_level}
                onChange={(e) =>
                  setDraft({ ...draft, orchestrator: { ...draft.orchestrator, log_level: e.target.value } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              >
                {["debug", "info", "warn", "error"].map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </FormField>
          </div>
        )}

        {activeTab === "Concurrency" && (
          <div className="flex flex-col gap-[var(--gap-block)]">
            <FormField label="Max Concurrent Agents">
              <input
                type="number"
                min={1}
                value={draft.limits.max_concurrent_agents}
                onChange={(e) =>
                  setDraft({ ...draft, limits: { ...draft.limits, max_concurrent_agents: parseInt(e.target.value) || 5 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
            <FormField label="Max Concurrent per Project">
              <input
                type="number"
                min={1}
                value={draft.limits.max_concurrent_per_project}
                onChange={(e) =>
                  setDraft({ ...draft, limits: { ...draft.limits, max_concurrent_per_project: parseInt(e.target.value) || 3 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
            <FormField label="Max Spawns per Hour">
              <input
                type="number"
                min={1}
                value={draft.limits.max_spawns_per_hour}
                onChange={(e) =>
                  setDraft({ ...draft, limits: { ...draft.limits, max_spawns_per_hour: parseInt(e.target.value) || 20 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
            <FormField label="Cooldown on Failure (seconds)">
              <input
                type="number"
                min={0}
                value={draft.limits.cooldown_on_failure}
                onChange={(e) =>
                  setDraft({ ...draft, limits: { ...draft.limits, cooldown_on_failure: parseInt(e.target.value) || 300 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
          </div>
        )}

        {activeTab === "Database" && (
          <div className="flex flex-col gap-[var(--gap-block)]">
            <p className="text-xs text-zinc-500">Database connection info is read-only.</p>
            <FormField label="Host">
              <input value={draft.database.host} disabled className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500" />
            </FormField>
            <FormField label="Port">
              <input value={draft.database.port} disabled className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500" />
            </FormField>
            <FormField label="Database Name">
              <input value={draft.database.name} disabled className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500" />
            </FormField>
            <FormField label="Pool Min / Max">
              <div className="flex gap-2">
                <input
                  type="number"
                  value={draft.database.pool_min}
                  onChange={(e) =>
                    setDraft({ ...draft, database: { ...draft.database, pool_min: parseInt(e.target.value) || 2 } })
                  }
                  className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
                />
                <input
                  type="number"
                  value={draft.database.pool_max}
                  onChange={(e) =>
                    setDraft({ ...draft, database: { ...draft.database, pool_max: parseInt(e.target.value) || 10 } })
                  }
                  className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
                />
              </div>
            </FormField>
            <FormField label="Auto-Migrate">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.database.auto_migrate}
                  onChange={(e) =>
                    setDraft({ ...draft, database: { ...draft.database, auto_migrate: e.target.checked } })
                  }
                />
                Run migrations on startup
              </label>
            </FormField>
          </div>
        )}

        {activeTab === "Memory" && (
          <div className="flex flex-col gap-[var(--gap-block)]">
            <FormField label="Extraction on Session End">
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={draft.memory.extraction_on_session_end}
                  onChange={(e) =>
                    setDraft({ ...draft, memory: { ...draft.memory, extraction_on_session_end: e.target.checked } })
                  }
                />
                Extract memories when agent sessions end
              </label>
            </FormField>
            <FormField label="Summary Rewrite Schedule">
              <select
                value={draft.memory.summary_rewrite_schedule}
                onChange={(e) =>
                  setDraft({ ...draft, memory: { ...draft.memory, summary_rewrite_schedule: e.target.value } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              >
                {["daily", "weekly", "monthly"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Fact Decay Days">
              <input
                type="number"
                min={1}
                value={draft.memory.fact_decay_days}
                onChange={(e) =>
                  setDraft({ ...draft, memory: { ...draft.memory, fact_decay_days: parseInt(e.target.value) || 90 } })
                }
                className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-[var(--gap-block)]">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleSaveAndRestart}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          Save & Restart
        </button>
      </div>

      <ConfirmDialog
        open={showRestart}
        title="Restart Daemon?"
        description="This will save your changes and restart the daemon. Running agents will be briefly interrupted."
        confirmLabel="Save & Restart"
        onConfirm={confirmRestart}
        onCancel={() => setShowRestart(false)}
      />
    </div>
  );
}
