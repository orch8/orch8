import { ChatMessageRenderer } from "./ChatMessageRenderer.js";
import type { ChatMessage as ChatMessageType } from "../../hooks/useChatMessages.js";

interface ChatMessageProps {
  projectId: string;
  message: ChatMessageType;
}

export function ChatMessage({ projectId, message }: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-md border border-edge-soft bg-surface-2 px-4 py-2 type-body text-ink">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-sm bg-surface px-3 py-1 type-label text-whisper">
          {message.content}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[90%] rounded-md border border-edge-soft bg-surface px-4 py-3">
        <ChatMessageRenderer
          projectId={projectId}
          chatId={message.chatId}
          content={message.content}
          cards={message.cards}
        />
        {message.status === "streaming" && (
          <div className="mt-2 type-micro text-whisper">Streaming…</div>
        )}
        {message.status === "error" && (
          <div className="mt-2 type-micro text-red">Error</div>
        )}
      </div>
    </div>
  );
}
