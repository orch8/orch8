import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "../../../../hooks/useChats.js";
import { useChatMessages } from "../../../../hooks/useChatMessages.js";
import { ChatHeader } from "../../../../components/chat/ChatHeader.js";
import { ChatMessageStream } from "../../../../components/chat/ChatMessageStream.js";
import { ChatInput } from "../../../../components/chat/ChatInput.js";

function ChatThreadPage() {
  const { projectSlug: projectId, chatId } = Route.useParams();
  const { data: chat, isLoading: chatLoading, isError } = useChat(chatId);
  const { data: messages, isLoading: msgsLoading } = useChatMessages(chatId);

  if (chatLoading || msgsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-600">Loading thread…</p>
      </div>
    );
  }

  if (isError || !chat) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-400">Chat not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ChatHeader chat={chat} projectId={projectId} />
      <ChatMessageStream
        chatId={chatId}
        projectId={projectId}
        messages={messages ?? []}
      />
      <ChatInput chatId={chatId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/chat/$chatId")({
  component: ChatThreadPage,
});
