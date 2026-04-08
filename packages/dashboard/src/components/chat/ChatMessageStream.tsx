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

export function ChatMessageStream({
  chatId,
  projectId,
  messages,
}: ChatMessageStreamProps) {
  const { streaming } = useChatStream(chatId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming?.buffer]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((m) => (
          <ChatMessage key={m.id} projectId={projectId} message={m} />
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="w-full max-w-[90%] rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <ChatMessageRenderer
                projectId={projectId}
                chatId={chatId}
                content={streaming.buffer}
                cards={[]}
              />
              <div className="mt-2 text-xs text-zinc-500">Streaming…</div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
