import { createContext, useContext, useCallback, useRef, useMemo } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
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

export interface WsEvent {
  type: string;
  taskId?: string;
  agentId?: string;
  runId?: string;
  chatId?: string;
  messageId?: string;
  cardId?: string;
  chunk?: string;
  [key: string]: unknown;
}

type EventHandler = (event: WsEvent) => void;

interface WsEventsContextValue {
  connected: boolean;
  send: (data: unknown) => void;
  subscribe: (eventType: string, handler: EventHandler) => () => void;
}

const WsEventsContext = createContext<WsEventsContextValue | null>(null);

const TOAST_TYPES = new Set([
  "verification_failed", "verification_passed",
  "agent_failure", "budget_exceeded", "stuck_task",
]);

export function WsEventsProvider({ children }: { children: ReactNode }) {
  const addToast = useToastStore((s) => s.add);
  const qc = useQueryClient();
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());

  const subscribe = useCallback(
    (eventType: string, handler: EventHandler) => {
      if (!handlersRef.current.has(eventType)) {
        handlersRef.current.set(eventType, new Set());
      }
      handlersRef.current.get(eventType)!.add(handler);
      return () => {
        handlersRef.current.get(eventType)?.delete(handler);
      };
    },
    [],
  );

  const onMessage = useCallback(
    (data: unknown) => {
      const event = data as WsEvent;
      if (!event.type) return;

      handlersRef.current.get(event.type)?.forEach((h) => h(event));

      switch (event.type) {
        case "task_updated":
        case "task_created":
        case "task_transitioned":
          qc.invalidateQueries({ queryKey: ["tasks"] });
          if (event.taskId) {
            qc.invalidateQueries({ queryKey: ["task", event.taskId] });
          }
          break;
        case "agent_updated":
        case "agent_paused":
        case "agent_resumed":
          qc.invalidateQueries({ queryKey: ["agents"] });
          break;
        case "run_created":
        case "run_completed":
        case "run_failed":
          qc.invalidateQueries({ queryKey: ["runs"] });
          if (event.runId) {
            qc.invalidateQueries({ queryKey: ["run", event.runId] });
          }
          break;
        case "budget_alert":
          qc.invalidateQueries({ queryKey: ["costSummary"] });
          qc.invalidateQueries({ queryKey: ["agents"] });
          break;
        case "notification:new": {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          const notifType = (event as any).notificationType as string;
          if (TOAST_TYPES.has(notifType)) {
            addToast({
              id: (event as any).id ?? String(Date.now()),
              type: notifType ?? "info",
              title: (event as any).title ?? "Notification",
              message: (event as any).message ?? "",
              link: (event as any).link,
            });
          }
          break;
        }
        case "verification:verdict":
        case "verification:response":
        case "verification:referee":
          qc.invalidateQueries({ queryKey: ["tasks"] });
          if (event.taskId) {
            qc.invalidateQueries({ queryKey: ["task", event.taskId] });
            qc.invalidateQueries({ queryKey: ["comments", event.taskId] });
          }
          break;
        case "daemon:stats":
          qc.invalidateQueries({ queryKey: ["daemonStatus"] });
          break;
        case "activity:new":
          qc.invalidateQueries({ queryKey: ["activity"] });
          break;
        case "comment:new":
          if (event.taskId) {
            qc.invalidateQueries({ queryKey: ["comments", event.taskId] });
          }
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
          if (event.chatId) {
            qc.invalidateQueries({ queryKey: ["chatMessages", event.chatId] });
            qc.invalidateQueries({ queryKey: ["chats"] });
          }
          break;
        case "chat_message_error":
          if (event.chatId) {
            qc.invalidateQueries({ queryKey: ["chatMessages", event.chatId] });
          }
          break;
        case "chat_card_decision":
          if (event.chatId) {
            qc.invalidateQueries({ queryKey: ["chatMessages", event.chatId] });
          }
          break;
      }
    },
    [qc, addToast],
  );

  // Current projectId drives the WebSocket scope. When the user navigates
  // between projects, the URL changes, this re-renders, and useWebSocket closes
  // the old socket + opens a new one scoped to the new project.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const projectId = extractProjectIdFromPath(pathname);
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

export function useWsEvents(): WsEventsContextValue {
  const ctx = useContext(WsEventsContext);
  if (!ctx) {
    throw new Error("useWsEvents must be used within WsEventsProvider");
  }
  return ctx;
}
