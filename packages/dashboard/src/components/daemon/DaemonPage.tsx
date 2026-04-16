import { useState, useEffect, useRef } from "react";
import { useDaemonStatus, useRestartDaemon } from "../../hooks/useDaemon.js";
import { useWsEvents } from "../../hooks/WsEventsProvider.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";

const LOG_COLORS: Record<string, string> = {
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  debug: "text-zinc-500",
};

const MAX_LOG_LINES = 500;

interface LogLine {
  id: number;
  level: string;
  message: string;
  timestamp: string;
}

export function DaemonPageComponent() {
  const { data: status } = useDaemonStatus();
  const restartDaemon = useRestartDaemon();
  const { subscribe } = useWsEvents();
  const [showRestart, setShowRestart] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);

  // Subscribe to daemon:log events. Keep a bounded ring of the last
  // MAX_LOG_LINES entries; allocate exactly one new array per event instead
  // of the old `[...prev, new].slice(-500)` (which allocated twice).
  useEffect(() => {
    const unsub = subscribe("daemon:log", (event) => {
      setLogs((prev) => {
        const line: LogLine = {
          id: ++logIdRef.current,
          level: event.level,
          message: event.message,
          timestamp: event.timestamp,
        };
        if (prev.length < MAX_LOG_LINES) return [...prev, line];
        // Drop the oldest so length stays at MAX_LOG_LINES.
        const next = prev.slice(1);
        next.push(line);
        return next;
      });
    });
    return unsub;
  }, [subscribe]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  return (
    <div className="flex flex-col gap-[var(--gap-section)]">
      {/* Status */}
      <div className="grid grid-cols-4 gap-[var(--gap-block)]">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-[var(--gap-block)]">
          <span className="text-xs text-zinc-500">Status</span>
          <div className="mt-1 flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${status?.status === "running" ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="type-section text-zinc-100">
              {status?.status === "running" ? "Running" : "Unknown"}
            </span>
          </div>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-[var(--gap-block)]">
          <span className="text-xs text-zinc-500">Uptime</span>
          <p className="mt-1 type-section text-zinc-100">
            {status?.uptimeFormatted ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-[var(--gap-block)]">
          <span className="text-xs text-zinc-500">Active Processes</span>
          <p className="mt-1 type-section text-zinc-100">
            {status?.processCount ?? 0}
          </p>
          <p className="text-xs text-zinc-500">{status?.queueDepth ?? 0} queued</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-[var(--gap-block)]">
          <span className="text-xs text-zinc-500">Tick Interval</span>
          <p className="mt-1 type-section text-zinc-100">
            {status?.tickIntervalMs ?? "—"}ms
          </p>
          <button
            onClick={() => setShowRestart(true)}
            className="mt-2 rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500"
          >
            Restart
          </button>
        </div>
      </div>

      {/* Live Log */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="type-section text-zinc-300">Live Log</h3>
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              Auto-scroll
            </label>
            <button
              onClick={() => setLogs([])}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="h-96 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
          {logs.length === 0 && (
            <p className="text-zinc-600">Waiting for log events...</p>
          )}
          {logs.map((line) => (
            <div key={line.id} className="flex gap-2">
              <span className="shrink-0 text-zinc-600">
                {new Date(line.timestamp).toLocaleTimeString()}
              </span>
              <span className={`shrink-0 uppercase ${LOG_COLORS[line.level] ?? "text-zinc-400"}`}>
                {line.level.padEnd(5)}
              </span>
              <span className="text-zinc-300">{line.message}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>

      <ConfirmDialog
        open={showRestart}
        title="Restart Daemon?"
        description="This will briefly interrupt all running agents. They will resume after restart."
        confirmLabel="Restart"
        variant="destructive"
        onConfirm={() => {
          restartDaemon.mutate();
          setShowRestart(false);
        }}
        onCancel={() => setShowRestart(false)}
      />
    </div>
  );
}
