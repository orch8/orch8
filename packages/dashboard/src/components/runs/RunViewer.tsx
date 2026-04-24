import { useState, useEffect, useRef } from "react";
import { XIcon } from "lucide-react";
import { useRun, useRunLog } from "../../hooks/useRuns.js";
import { useRunEvents, useRunEventStream } from "../../hooks/useRunEvents.js";
import { useModalA11y } from "../../hooks/useModalA11y.js";
import { RunEventCard } from "./RunEventCard.js";
import type { RunEvent } from "@orch/shared";

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-zinc-800 text-zinc-400",
  running: "bg-blue-900/50 text-blue-300",
  succeeded: "bg-emerald-900/50 text-emerald-300",
  failed: "bg-red-900/50 text-red-300",
  timed_out: "bg-yellow-900/50 text-yellow-300",
  cancelled: "bg-zinc-800 text-zinc-500",
};

type Tab = "events" | "log" | "details";

interface RunViewerProps {
  runId: string;
  projectId: string;
  onClose: () => void;
}

export function RunViewer({ runId, projectId, onClose }: RunViewerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("events");
  const { data: run } = useRun(runId, projectId);
  const { data: events } = useRunEvents(runId, projectId);
  const { data: logData } = useRunLog(runId, projectId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Subscribe to live event stream
  useRunEventStream(runId, projectId, run?.status);

  // The dialog is only "mounted" once we have a run, but we want a11y
  // behavior active whenever the component renders its content.
  useModalA11y(dialogRef, !!run, onClose);

  const isLive = run?.status === "running" || run?.status === "queued";

  // Auto-scroll to bottom for live runs
  useEffect(() => {
    if (isLive && scrollRef.current && activeTab === "events") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events?.length, isLive, activeTab]);

  if (!run) return null;

  const duration =
    run.startedAt && run.finishedAt
      ? Math.round(
          (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000,
        )
      : null;

  const baseTimestamp = events?.[0]?.timestamp;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Slide-over panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-viewer-title"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-zinc-800 bg-zinc-950"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-3">
            {isLive && (
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            )}
            <h2 id="run-viewer-title" className="font-mono text-sm font-semibold text-zinc-200">
              {run.id}
            </h2>
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[run.status] ?? ""}`}>
              {run.status}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close run viewer"
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 px-4">
          {(["events", "log", "details"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-blue-500 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "log" ? "Raw Log" : tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-[var(--gap-block)]">
          {activeTab === "events" && (
            <EventsTab events={events ?? []} isLive={isLive} baseTimestamp={baseTimestamp} />
          )}
          {activeTab === "log" && (
            <LogTab logData={logData} isLive={isLive} />
          )}
          {activeTab === "details" && (
            <DetailsTab run={run} duration={duration} />
          )}
        </div>
      </div>
    </div>
  );
}

function EventsTab({
  events,
  isLive,
  baseTimestamp,
}: {
  events: RunEvent[];
  isLive: boolean;
  baseTimestamp?: string;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        {isLive ? "Waiting for events..." : "No events recorded for this run."}
      </p>
    );
  }

  return (
    <div>
      {events.map((event) => (
        <RunEventCard key={event.id ?? event.seq} event={event} baseTimestamp={baseTimestamp} />
      ))}
    </div>
  );
}

function LogTab({
  logData,
  isLive,
}: {
  logData?: { content: string; store: string; bytes: number } | null;
  isLive: boolean;
}) {
  if (isLive) {
    return <p className="text-sm text-zinc-600">Log available when run completes.</p>;
  }

  if (!logData?.content) {
    return <p className="text-sm text-zinc-600">No log data available.</p>;
  }

  return (
    <pre className="whitespace-pre-wrap rounded bg-zinc-900 p-3 font-mono text-xs text-zinc-400">
      {logData.content}
    </pre>
  );
}

function DetailsTab({
  run,
  duration,
}: {
  run: any;
  duration: number | null;
}) {
  const fields = [
    { label: "Agent", value: run.agentId },
    { label: "Task", value: run.taskId ?? "\u2014" },
    { label: "Source", value: run.invocationSource },
    { label: "Model", value: run.model ?? "\u2014" },
    { label: "Duration", value: duration != null ? `${duration}s` : "\u2014" },
    { label: "Cost", value: run.costUsd != null ? `$${run.costUsd.toFixed(4)}` : "\u2014" },
    { label: "Exit Code", value: run.exitCode ?? "\u2014" },
    { label: "Billing", value: run.billingType ?? "\u2014" },
    { label: "Session Before", value: run.sessionIdBefore ?? "\u2014" },
    { label: "Session After", value: run.sessionIdAfter ?? "\u2014" },
  ];

  return (
    <div className="flex flex-col gap-[var(--gap-block)]">
      <div className="grid grid-cols-2 gap-[var(--gap-block)] text-sm">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="text-zinc-600">{f.label}</span>
            <p className="font-mono text-zinc-300">{String(f.value)}</p>
          </div>
        ))}
      </div>

      {run.error && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-400">Error</h4>
          <pre className="rounded bg-red-950/30 p-2 text-xs text-red-300">{run.error}</pre>
        </div>
      )}

      {run.parentRunId && (
        <p className="text-xs text-zinc-500">Continuation of run {run.parentRunId}</p>
      )}
    </div>
  );
}
