import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useChats, useCreateChat } from "../../../../hooks/useChats.js";
import { EmptyState } from "../../../../components/ui/EmptyState.js";

function ChatIndexPage() {
  const { projectSlug: projectId } = Route.useParams();
  const navigate = useNavigate();
  const { data: chats, isLoading } = useChats(projectId);
  const createChat = useCreateChat();
  const didAttemptCreate = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!chats) return;

    if (chats.length > 0) {
      const target = chats[0]; // pinned-first ordering enforced by backend
      navigate({
        to: "/projects/$projectSlug/chat/$chatId",
        params: { projectSlug: projectId, chatId: target.id },
        replace: true,
      });
      return;
    }

    // No chats yet — create one and redirect. Guard with a ref so StrictMode's
    // double-invoke can't fire two creates, and with isPending so a re-render
    // mid-flight can't either. createChat is intentionally omitted from deps
    // because useMutation returns a fresh object on every render, which would
    // otherwise re-fire this effect in a loop and spawn many chats.
    if (didAttemptCreate.current) return;
    if (createChat.isPending) return;
    didAttemptCreate.current = true;

    createChat.mutate(
      { projectId },
      {
        onSuccess: (chat) => {
          navigate({
            to: "/projects/$projectSlug/chat/$chatId",
            params: { projectSlug: projectId, chatId: chat.id },
            replace: true,
          });
        },
        onError: () => {
          didAttemptCreate.current = false;
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, chats, projectId]);

  return (
    <div className="flex h-full items-center justify-center px-6">
      <EmptyState
        title="Opening chat"
        body="Starting a fresh conversation for this project."
      />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/chat/")({
  component: ChatIndexPage,
});
