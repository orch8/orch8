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
        <div className="max-w-[80%] rounded-lg bg-sky-700/30 px-4 py-2 text-sm text-zinc-100">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "system") {
    return (
      <div className="flex justify-center">
        <div className="rounded-md bg-zinc-900 px-3 py-1 text-xs italic text-zinc-500">
          {message.content}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[90%] rounded-lg bg-zinc-900 px-4 py-3">
        <ChatMessageRenderer
          projectId={projectId}
          content={message.content}
          cards={message.cards}
        />
        {message.status === "streaming" && (
          <div className="mt-2 text-xs text-zinc-500">Streaming…</div>
        )}
        {message.status === "error" && (
          <div className="mt-2 text-xs text-red-400">Error</div>
        )}
      </div>
    </div>
  );
}
