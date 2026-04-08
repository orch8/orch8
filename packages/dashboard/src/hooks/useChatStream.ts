// packages/dashboard/src/hooks/useChatStream.ts
import { useEffect, useRef, useState } from "react";
import { useWsEvents } from "./WsEventsProvider.js";

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

    const offStarted = subscribe("chat_message_started", (event) => {
      if (event.chatId !== chatId) return;
      messageIdRef.current = event.messageId;
      bufferRef.current = "";
      setStreaming({ messageId: event.messageId, buffer: "" });
    });

    const offChunk = subscribe("chat_message_chunk", (event) => {
      if (event.chatId !== chatId) return;
      if (messageIdRef.current !== event.messageId) return;
      bufferRef.current += event.chunk;
      setStreaming({ messageId: event.messageId, buffer: bufferRef.current });
    });

    const offComplete = subscribe("chat_message_complete", (event) => {
      if (event.chatId !== chatId) return;
      bufferRef.current = "";
      messageIdRef.current = null;
      setStreaming(null);
    });

    const offError = subscribe("chat_message_error", (event) => {
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
