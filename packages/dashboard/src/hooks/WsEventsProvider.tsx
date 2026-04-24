import { createContext, useContext, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import type { WsEvent, WsEventType, WsEventByType } from "@orch/shared";
import { useWebSocket } from "./useWebSocket.js";
import { useToastStore } from "../stores/toast.js";

/**
 * Extract the current projectId from the URL pathname. Returns null for routes
 * that don't live under /projects/:projectId (e.g. /daemon, /settings).
 *
 * We need this so the /ws socket can be scoped to a single project — the daemon
 * filters broadcasts by socket scope to prevent cross-tenant event leakage
 * (release blocker 1.1).
 */
function extractProjectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  if (!match) return null;
  // Guard against the literal "/projects/new" route — that's project creation,
  // not a specific project scope.
  if (match[1] === "new") return null;
  return match[1] ?? null;
}

/**
 * Subscriber callback for a specific event type. The callback receives
 * the exact variant selected by `eventType`, so e.g. subscribing to
 * `"chat_message_chunk"` yields an event with `chatId`, `messageId`, and
 * `chunk` as string fields — no runtime casts needed.
 */
type EventHandler<T extends WsEventType = WsEventType> = (
  event: WsEventByType<T>,
) => void;

interface WsEventsContextValue {
  connected: boolean;
  send: (data: unknown) => void;
  subscribe: <T extends WsEventType>(
    eventType: T,
    handler: EventHandler<T>,
  ) => () => void;
}

const WsEventsContext = createContext<WsEventsContextValue | null>(null);

const TOAST_TYPES = new Set([
  "verification_failed", "verification_passed",
  "agent_failure", "budget_exceeded", "stuck_task",
]);

export function WsEventsProvider({ children }: { children: ReactNode }) {
  const addToast = useToastStore((s) => s.add);
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const projectId = extractProjectIdFromPath(pathname);
  // Typed as a loose handler set internally; `subscribe` gates insertion
  // to the narrow generic signature so each call site remains type-safe.
  const handlersRef = useRef<Map<string, Set<(event: WsEvent) => void>>>(new Map());

  const subscribe = useCallback(
    <T extends WsEventType>(
      eventType: T,
      handler: EventHandler<T>,
    ) => {
      if (!handlersRef.current.has(eventType)) {
        handlersRef.current.set(eventType, new Set());
      }
      // Safe narrowing: we only invoke this handler when dispatching an
      // event whose `type` equals `eventType`, so the cast from
      // `(WsEvent) => void` back to the narrow variant holds at runtime.
      const loose = handler as (event: WsEvent) => void;
      handlersRef.current.get(eventType)!.add(loose);
      return () => {
        handlersRef.current.get(eventType)?.delete(loose);
      };
    },
    [],
  );

  const onMessage = useCallback(
    (data: unknown) => {
      // Treat incoming frames as WsEvent. The websocket is a trusted
      // in-cluster channel; no runtime validation needed here, only
      // discriminator narrowing below.
      const event = data as WsEvent;
      if (!event || typeof event.type !== "string") return;

      handlersRef.current.get(event.type)?.forEach((h) => h(event));

      switch (event.type) {
        case "task_transitioned":
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["task", event.taskId] });
          break;
        case "agent_paused":
        case "agent_resumed":
          qc.invalidateQueries({ queryKey: ["agents"] });
          break;
        case "run_created":
        case "run_completed":
        case "run_failed":
          qc.invalidateQueries({ queryKey: ["runs"] });
          qc.invalidateQueries({ queryKey: ["run", event.runId] });
          invalidateErrorQueries(qc, projectId);
          break;
        case "budget_alert":
          qc.invalidateQueries({ queryKey: ["cost-summary"] });
          qc.invalidateQueries({ queryKey: ["agents"] });
          break;
        case "notification:new": {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          if (TOAST_TYPES.has(event.notificationType)) {
            addToast({
              id: event.id,
              type: event.notificationType,
              title: event.title,
              message: event.message,
              link: event.link ?? undefined,
            });
          }
          break;
        }
        case "verification:verdict":
        case "verification:response":
        case "verification:referee":
          qc.invalidateQueries({ queryKey: ["tasks"] });
          qc.invalidateQueries({ queryKey: ["task", event.taskId] });
          qc.invalidateQueries({ queryKey: ["comments", event.taskId] });
          break;
        case "daemon:stats":
          qc.invalidateQueries({ queryKey: ["daemon-status"] });
          break;
        case "activity:new":
          qc.invalidateQueries({ queryKey: ["activity"] });
          break;
        case "comment:new":
          qc.invalidateQueries({ queryKey: ["comments", event.taskId] });
          break;
        case "run_event":
          // Handled by useRunEventStream subscribers — no invalidation needed.
          break;
        case "chat_message_started":
          // No invalidation needed; subscribers handle live streaming.
          break;
        case "chat_message_chunk":
          // Same — pure live event.
          break;
        case "chat_message_complete":
          qc.invalidateQueries({ queryKey: ["chat-messages", event.chatId] });
          qc.invalidateQueries({ queryKey: ["chats"] });
          break;
        case "chat_message_error":
          qc.invalidateQueries({ queryKey: ["chat-messages", event.chatId] });
          invalidateErrorQueries(qc, projectId);
          break;
        case "chat_card_decision":
          qc.invalidateQueries({ queryKey: ["chat-messages", event.chatId] });
          break;
        case "daemon:log":
          if (isErrorLogEvent(event)) {
            invalidateErrorQueries(qc, event.projectId ?? projectId);
          }
          break;
      }
    },
    [qc, addToast, projectId],
  );

  // Current projectId drives the WebSocket scope. When the user navigates
  // between projects, the URL changes, this re-renders, and useWebSocket closes
  // the old socket + opens a new one scoped to the new project.
  const wsUrl = projectId ? `/ws?projectId=${encodeURIComponent(projectId)}` : "/ws";

  const { connected, send } = useWebSocket({
    url: wsUrl,
    onMessage,
  });

  const value = useMemo(
    () => ({ connected, send, subscribe }),
    [connected, send, subscribe],
  );

  return (
    <WsEventsContext.Provider value={value}>
      {children}
    </WsEventsContext.Provider>
  );
}

function invalidateErrorQueries(
  qc: ReturnType<typeof useQueryClient>,
  projectId: string | null,
) {
  qc.invalidateQueries({ queryKey: projectId ? ["errors", projectId] : ["errors"] });
  qc.invalidateQueries({
    queryKey: projectId ? ["errors-summary", projectId] : ["errors-summary"],
  });
}

function isErrorLogEvent(event: WsEventByType<"daemon:log">): event is WsEventByType<"daemon:log"> & {
  projectId?: string;
  errorId?: string;
  code?: string;
  source?: string;
} {
  return (
    event.level === "error" ||
    event.level === "fatal" ||
    "errorId" in event ||
    "code" in event
  );
}

export function useWsEvents(): WsEventsContextValue {
  const ctx = useContext(WsEventsContext);
  if (!ctx) {
    throw new Error("useWsEvents must be used within WsEventsProvider");
  }
  return ctx;
}
