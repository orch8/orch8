import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useCreateChat } from "../../../../hooks/useChats.js";

function NewChatPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const createChat = useCreateChat();
  const fired = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Use `mutateAsync` and await the returned promise rather than passing an
  // `onSuccess` callback to `mutate()`. When this page mounts under
  // <RouterProvider> + StrictMode, the component is unmounted and remounted
  // (StrictMode's dev-mode simulated remount, plus TanStack Router's initial
  // route transition). During that unmount, React Query's MutationObserver
  // loses its last listener and calls `removeObserver(this)` on the in-flight
  // mutation. There is no re-attach on re-subscribe — so when the mutation
  // finally resolves, the mutation's `#observers` list is empty and
  // MutationObserver#notify is never called, silently dropping the
  // mutate-level `onSuccess` callback that was supposed to navigate. The
  // `mutateAsync` promise resolves directly from `Mutation.execute()`, which
  // is independent of observer attachment, so it fires reliably.
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    createChat
      .mutateAsync({ projectId })
      .then((chat) => {
        navigate({
          to: "/projects/$projectId/chat/$chatId",
          params: { projectId, chatId: chat.id },
          replace: true,
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "unknown error";
        setErrorMessage(message);
        // Reset so the user can retry by navigating back to /new.
        fired.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (errorMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">Failed to create chat.</p>
        <p className="text-xs text-zinc-500">{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-zinc-600">Creating new chat…</p>
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/chat/new")({
  component: NewChatPage,
});
