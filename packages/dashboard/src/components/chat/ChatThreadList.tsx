import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useChats } from "../../hooks/useChats.js";
import { ChatThreadItem } from "./ChatThreadItem.js";
import { SectionLabel } from "../ui/SectionLabel.js";

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
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-edge-soft bg-sidebar">
      <div className="border-b border-edge-soft px-3 py-3">
        <Link
          to="/projects/$projectId/chat/new"
          params={{ projectId }}
          className="focus-ring block w-full rounded-sm bg-accent px-3 py-2 text-center type-ui text-canvas hover:bg-[color:var(--color-accent-hover)]"
        >
          + New chat
        </Link>
      </div>

      <div className="border-b border-edge-soft px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search threads"
          aria-label="Search threads"
          className="focus-ring w-full rounded-sm border border-edge bg-surface px-3 py-1.5 type-body text-ink placeholder:text-whisper"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading && (
          <p className="px-3 py-2 type-micro text-whisper">Loading…</p>
        )}
        {!isLoading && pinned.length === 0 && recent.length === 0 && (
          <p className="px-3 py-2 type-micro text-whisper">No chats yet.</p>
        )}
        {pinned.length > 0 && (
          <div className="mb-3">
            <div className="px-3">
              <SectionLabel>PINNED</SectionLabel>
            </div>
            {pinned.map((chat) => (
              <ChatThreadItem key={chat.id} projectId={projectId} chat={chat} />
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div>
            <div className="px-3">
              <SectionLabel>RECENT</SectionLabel>
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
