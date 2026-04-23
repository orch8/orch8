import { useState, useEffect } from "react";
import { ADAPTER_TYPES, type AdapterType } from "@orch/shared";
import { FormField } from "../shared/FormField.js";
import type { Agent } from "../../types.js";
import type { UseMutationResult } from "@tanstack/react-query";
import { api } from "../../api/client.js";

const MODEL_OPTIONS = [
  "gpt-5.5",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
];

const EFFORT_OPTIONS = ["low", "medium", "high", "xhigh", "max"];

interface GeneralTabProps {
  agent: Agent;
  projectId: string;
  updateAgent: UseMutationResult<any, any, any, any>;
}

export function GeneralTab({ agent, projectId, updateAgent }: GeneralTabProps) {
  const [name, setName] = useState(agent.name);
  const [icon, setIcon] = useState(agent.icon ?? "🤖");
  const [color, setColor] = useState(agent.color ?? "#888780");
  const [model, setModel] = useState(agent.model);
  const [effort, setEffort] = useState(agent.effort ?? "");
  const [adapterType, setAdapterType] = useState(agent.adapterType);
  const [adapterConfig, setAdapterConfig] = useState(
    JSON.stringify(agent.adapterConfig ?? {}, null, 2),
  );
  const [testStatus, setTestStatus] = useState<{
    state: "idle" | "running" | "ok" | "error";
    message?: string;
  }>({ state: "idle" });
  const [envVars, setEnvVars] = useState<Record<string, string>>(
    (agent.envVars as Record<string, string>) ?? {},
  );
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    setName(agent.name);
    setIcon(agent.icon ?? "🤖");
    setColor(agent.color ?? "#888780");
    setModel(agent.model);
    setEffort(agent.effort ?? "");
    setAdapterType(agent.adapterType);
    setAdapterConfig(JSON.stringify(agent.adapterConfig ?? {}, null, 2));
    setEnvVars((agent.envVars as Record<string, string>) ?? {});
    setTestStatus({ state: "idle" });
  }, [agent]);

  function handleSave() {
    let parsedAdapterConfig: Record<string, unknown> = {};
    try {
      parsedAdapterConfig = JSON.parse(adapterConfig);
    } catch {
      // keep empty
    }

    updateAgent.mutate({
      agentId: agent.id,
      projectId,
      name,
      icon,
      color,
      model,
      effort: effort || null,
      adapterType,
      adapterConfig: parsedAdapterConfig,
      envVars,
    });
  }

  function addEnvVar() {
    if (!newKey.trim()) return;
    setEnvVars((prev) => ({ ...prev, [newKey.trim()]: newValue }));
    setNewKey("");
    setNewValue("");
  }

  function removeEnvVar(key: string) {
    setEnvVars((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function testAdapter() {
    let parsedAdapterConfig: Record<string, unknown> = {};
    try {
      parsedAdapterConfig = JSON.parse(adapterConfig);
    } catch {
      setTestStatus({ state: "error", message: "Adapter config is not valid JSON" });
      return;
    }

    setTestStatus({ state: "running" });
    try {
      const result = await api.post<{
        ok: boolean;
        errorCode?: string;
        message?: string;
        sessionId?: string;
      }>(`/adapter/${adapterType}/test-environment`, { config: parsedAdapterConfig });
      setTestStatus({
        state: result.ok ? "ok" : "error",
        message: result.ok
          ? `Ready${result.sessionId ? ` (${result.sessionId})` : ""}`
          : `${result.errorCode ?? "error"}${result.message ? `: ${result.message}` : ""}`,
      });
    } catch (err) {
      setTestStatus({ state: "error", message: (err as Error).message });
    }
  }

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
          />
        </FormField>

        <FormField label="Role">
          <p className="py-2 text-sm text-zinc-400">{agent.role}</p>
        </FormField>

        <FormField label="Icon">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
          />
        </FormField>

        <FormField label="Color">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-zinc-800"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
            />
          </div>
        </FormField>

        <FormField label="Model">
          <select
            aria-label="Model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Effort">
          <select
            value={effort}
            onChange={(e) => setEffort(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
          >
            <option value="">Default</option>
            {EFFORT_OPTIONS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Environment Variables */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-300">Environment Variables</h3>
        <div className="space-y-2">
          {Object.entries(envVars).map(([key]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="flex-1 font-mono text-xs text-zinc-400">{key}</span>
              <span className="text-xs text-zinc-600">********</span>
              <button
                type="button"
                onClick={() => removeEnvVar(key)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex items-end gap-2">
            <input
              placeholder="Key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
            />
            <input
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              type="password"
              className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
            />
            <button
              type="button"
              onClick={addEnvVar}
              className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Adapter */}
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Adapter Type">
          <select
            value={adapterType}
            onChange={(e) => setAdapterType(e.target.value as AdapterType)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
          >
            {ADAPTER_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            {adapterType === "codex_local"
              ? "Requires codex on PATH and codex login or OPENAI_API_KEY."
              : "Uses Claude Code CLI from the local environment."}
          </p>
        </FormField>

        <FormField label="Adapter Config (JSON)">
          <textarea
            value={adapterConfig}
            onChange={(e) => setAdapterConfig(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-zinc-600 focus:outline-none"
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={testAdapter}
          disabled={testStatus.state === "running"}
          className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {testStatus.state === "running" ? "Testing..." : "Test Adapter"}
        </button>
        {testStatus.state !== "idle" && (
          <span
            className={
              testStatus.state === "ok"
                ? "text-sm text-green-400"
                : testStatus.state === "error"
                  ? "text-sm text-red-400"
                  : "text-sm text-zinc-400"
            }
          >
            {testStatus.message ?? "Running"}
          </span>
        )}
      </div>

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
