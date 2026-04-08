// packages/dashboard/src/hooks/useChatStream.ts
import { useEffect, useRef, useState } from "react";
import { useWsEvents, type WsEvent } from "./WsEventsProvider.js";

interface StreamingMessage {
  messageId: string;
  buffer: string;
}

/**
 * Subscribes to chat_message_chunk events for a given chatId and returns
 * the live streaming buffer for the most recent in-flight assistant
 * message. When chat_message_complete arrives the buffer is cleared and
 * the React Query cache is invalidated by WsEventsProvider — the
 * persisted message becomes visible naturally.
 */
export function useChatStream(chatId: string): {
  streaming: StreamingMessage | null;
} {
  const { subscribe } = useWsEvents();
  const [streaming, setStreaming] = useState<StreamingMessage | null>(null);
  const bufferRef = useRef<string>("");
  const messageIdRef = useRef<string | null>(null);

  useEffect(() => {
    bufferRef.current = "";
    messageIdRef.current = null;
    setStreaming(null);

    const offStarted = subscribe("chat_message_started", (event: WsEvent) => {
      if (event.chatId !== chatId) return;
      const messageId = event.messageId as string;
      messageIdRef.current = messageId;
      bufferRef.current = "";
      setStreaming({ messageId, buffer: "" });
    });

    const offChunk = subscribe("chat_message_chunk", (event: WsEvent) => {
      if (event.chatId !== chatId) return;
      const messageId = event.messageId as string;
      const chunk = event.chunk as string;
      if (messageIdRef.current !== messageId) return;
      bufferRef.current += chunk;
      setStreaming({ messageId, buffer: bufferRef.current });
    });

    const offComplete = subscribe("chat_message_complete", (event: WsEvent) => {
      if (event.chatId !== chatId) return;
      bufferRef.current = "";
      messageIdRef.current = null;
      setStreaming(null);
    });

    const offError = subscribe("chat_message_error", (event: WsEvent) => {
      if (event.chatId !== chatId) return;
      bufferRef.current = "";
      messageIdRef.current = null;
      setStreaming(null);
    });

    return () => {
      offStarted();
      offChunk();
      offComplete();
      offError();
    };
  }, [subscribe, chatId]);

  return { streaming };
}
