import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useCreateChat } from "../../../../hooks/useChats.js";

function NewChatPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const createChat = useCreateChat();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    createChat.mutate(
      { projectId },
      {
        onSuccess: (chat) => {
          navigate({
            to: "/projects/$projectId/chat/$chatId",
            params: { projectId, chatId: chat.id },
            replace: true,
          });
        },
      },
    );
  }, [projectId, createChat, navigate]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-zinc-600">Creating new chat…</p>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/chat/new")({
  component: NewChatPage,
});
