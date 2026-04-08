import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useChats } from "../../hooks/useChats.js";
import { ChatThreadItem } from "./ChatThreadItem.js";

interface ChatThreadListProps {
  projectId: string;
}

export function ChatThreadList({ projectId }: ChatThreadListProps) {
  const { data: chats, isLoading } = useChats(projectId);
  const [search, setSearch] = useState("");

  const { pinned, recent } = useMemo(() => {
    const filtered = (chats ?? []).filter((c) =>
      search.length === 0
        ? true
        : c.title.toLowerCase().includes(search.toLowerCase()),
    );
    return {
      pinned: filtered.filter((c) => c.pinned),
      recent: filtered.filter((c) => !c.pinned),
    };
  }, [chats, search]);

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-3">
        <Link
          to="/projects/$projectId/chat/new"
          params={{ projectId }}
          className="block w-full rounded-md bg-sky-700 px-3 py-2 text-center text-sm font-medium text-zinc-100 hover:bg-sky-600"
        >
          + New chat
        </Link>
      </div>

      <div className="border-b border-zinc-800 px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads"
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <p className="px-3 py-2 text-xs text-zinc-600">Loading…</p>
        )}
        {!isLoading && pinned.length === 0 && recent.length === 0 && (
          <p className="px-3 py-2 text-xs text-zinc-600">No chats yet.</p>
        )}
        {pinned.length > 0 && (
          <div className="mb-3">
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Pinned
            </div>
            {pinned.map((chat) => (
              <ChatThreadItem key={chat.id} projectId={projectId} chat={chat} />
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div>
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Recent
            </div>
            {recent.map((chat) => (
              <ChatThreadItem key={chat.id} projectId={projectId} chat={chat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
