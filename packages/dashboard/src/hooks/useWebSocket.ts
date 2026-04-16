import { useEffect, useRef, useCallback, useState } from "react";

export type WebSocketStatus = "connecting" | "open" | "disconnected";

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: unknown) => void;
  /** Initial reconnect delay in ms. Backoff doubles each failed attempt up to `maxReconnectDelay`. */
  reconnectInterval?: number;
  /** Upper bound on reconnect delay. Defaults to 30_000 ms. */
  maxReconnectDelay?: number;
  /** Maximum consecutive failed reconnects before giving up. Defaults to 10. */
  maxReconnectAttempts?: number;
}

export function useWebSocket({
  url,
  onMessage,
  reconnectInterval = 1000,
  maxReconnectDelay = 30_000,
  maxReconnectAttempts = 10,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const [status, setStatus] = useState<WebSocketStatus>("connecting");

  const connect = useCallback(
    (
      control: {
        shouldReconnect: boolean;
        attempts: number;
        timer: ReturnType<typeof setTimeout> | null;
      },
    ) => {
      setStatus("connecting");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}${url}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        // Reset backoff on a successful connection.
        control.attempts = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current?.(data);
        } catch {
          // ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        if (!control.shouldReconnect) return;
        if (control.attempts >= maxReconnectAttempts) return;
        // Exponential backoff: base * 2^attempts, capped at maxReconnectDelay.
        const delay = Math.min(
          reconnectInterval * 2 ** control.attempts,
          maxReconnectDelay,
        );
        control.attempts += 1;
        control.timer = setTimeout(() => connect(control), delay);
      };

      wsRef.current = ws;
    },
    [url, reconnectInterval, maxReconnectDelay, maxReconnectAttempts],
  );

  useEffect(() => {
    const control = {
      shouldReconnect: true,
      attempts: 0,
      timer: null as ReturnType<typeof setTimeout> | null,
    };
    connect(control);
    return () => {
      control.shouldReconnect = false;
      if (control.timer) clearTimeout(control.timer);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { status, connected: status === "open", send };
}
