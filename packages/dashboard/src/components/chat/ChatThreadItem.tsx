import { Link, useParams, useRouterState } from "@tanstack/react-router";
import type { Chat } from "../../hooks/useChats.js";

interface ChatThreadItemProps {
  projectId: string;
  chat: Chat;
}

export function ChatThreadItem({ projectId, chat }: ChatThreadItemProps) {
  const params = useParams({ strict: false }) as { chatId?: string };
  const isActive = params.chatId === chat.id;

  return (
    <Link
      to="/projects/$projectSlug/chat/$chatId"
      params={{ projectSlug: projectId, chatId: chat.id }}
      className={`block rounded-md px-3 py-2 text-sm transition-colors ${
        isActive
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        {chat.pinned && <span aria-hidden>📌</span>}
        <span className="truncate">{chat.title}</span>
      </div>
    </Link>
  );
}
