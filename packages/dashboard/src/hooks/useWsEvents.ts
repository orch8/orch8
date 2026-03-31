import { useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket.js";
import { useUiStore } from "../stores/ui.js";

export interface WsEvent {
  type: string;
  taskId?: string;
  agentId?: string;
  runId?: string;
  chunk?: string;
  [key: string]: unknown;
}

type EventHandler = (event: WsEvent) => void;

export function useWsEvents() {
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

      // Dispatch to specific subscribers
      handlersRef.current.get(event.type)?.forEach((h) => h(event));

      // Auto-invalidate caches based on event type
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
      }
    },
    [qc],
  );

  const { connected, send } = useWebSocket({
    url: "/ws",
    onMessage,
  });

  return { connected, send, subscribe };
}
