import { useEffect, useRef } from "react";
import type { ChatMessage as ChatMessageType } from "../../hooks/useChatMessages.js";
import { ChatMessage } from "./ChatMessage.js";
import { useChatStream } from "../../hooks/useChatStream.js";
import { ChatMessageRenderer } from "./ChatMessageRenderer.js";

interface ChatMessageStreamProps {
  chatId: string;
  projectId: string;
  messages: ChatMessageType[];
}

// Pixel tolerance for "user is pinned to the bottom".
const NEAR_BOTTOM_PX = 80;

export function ChatMessageStream({
  chatId,
  projectId,
  messages,
}: ChatMessageStreamProps) {
  const { streaming } = useChatStream(chatId);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // Only auto-scroll while the user is pinned to the bottom, and coalesce
  // bursts of token updates to one scroll per animation frame.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom > NEAR_BOTTOM_PX) return;

    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [messages, streaming?.buffer]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // The daemon inserts the assistant row in the DB as `status: "streaming"`
  // BEFORE the first chunk goes out (chat.service.ts runAssistantTurn).
  // `useSendChatMessage.onSuccess` then invalidates the chatMessages query,
  // so that placeholder row lands in `messages` while the live WS buffer is
  // simultaneously active. Rendering both would produce two "Streaming…"
  // boxes for the same logical message. Suppress the persisted row while
  // the live stream owns it; the WsEventsProvider invalidation on
  // chat_message_complete swaps in the final row once streaming ends.
  const displayMessages = streaming
    ? messages.filter((m) => m.id !== streaming.messageId)
    : messages;

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto bg-canvas px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {displayMessages.map((m) => (
          <ChatMessage key={m.id} projectId={projectId} message={m} />
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-full max-w-[90%] rounded-md border border-edge-soft bg-surface px-4 py-3">
              <ChatMessageRenderer
                projectId={projectId}
                chatId={chatId}
                content={streaming.buffer}
                cards={[]}
              />
              <div className="mt-2 type-micro text-whisper">Streaming…</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
