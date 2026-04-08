import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useChats, useCreateChat } from "../../../../hooks/useChats.js";

function ChatIndexPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: chats, isLoading } = useChats(projectId);
  const createChat = useCreateChat();

  useEffect(() => {
    if (isLoading) return;
    if (!chats) return;

    if (chats.length > 0) {
      const target = chats[0]; // pinned-first ordering enforced by backend
      navigate({
        to: "/projects/$projectId/chat/$chatId",
        params: { projectId, chatId: target.id },
        replace: true,
      });
      return;
    }

    // No chats yet — create one and redirect.
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
  }, [isLoading, chats, projectId, navigate, createChat]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-zinc-600">Opening chat…</p>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/chat/")({
  component: ChatIndexPage,
});
