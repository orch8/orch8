// packages/dashboard/src/components/chat/ChatHeader.tsx
import { useState } from "react";
import type { Chat } from "../../hooks/useChats.js";
import { useUpdateChat, useDeleteChat } from "../../hooks/useChats.js";
import { Link } from "@tanstack/react-router";

interface ChatHeaderProps {
  projectId: string;
  chat: Chat;
}

export function ChatHeader({ projectId, chat }: ChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chat.title);
  const updateChat = useUpdateChat();
  const deleteChat = useDeleteChat();
  const [menuOpen, setMenuOpen] = useState(false);

  function commitTitle() {
    const trimmed = draftTitle.trim();
    if (trimmed.length === 0 || trimmed === chat.title) {
      setEditing(false);
      setDraftTitle(chat.title);
      return;
    }
    updateChat.mutate(
      { chatId: chat.id, patch: { title: trimmed } },
      { onSettled: () => setEditing(false) },
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="flex items-center gap-3">
        {editing ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setEditing(false);
                setDraftTitle(chat.title);
              }
            }}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-zinc-200 hover:text-zinc-50"
            title="Click to rename"
          >
            {chat.title}
          </button>
        )}
        <Link
          to="/projects/$projectId/agents/$agentId"
          params={{ projectId, agentId: chat.agentId }}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          {chat.agentId}
        </Link>
      </div>

      <div className="relative">
        <button
          aria-label="Thread menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-sm shadow-lg">
            <button
              onClick={() => {
                updateChat.mutate({ chatId: chat.id, patch: { pinned: !chat.pinned } });
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-900"
            >
              {chat.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={() => {
                updateChat.mutate({ chatId: chat.id, patch: { archived: true } });
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-zinc-200 hover:bg-zinc-900"
            >
              Archive
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete chat "${chat.title}"?`)) {
                  deleteChat.mutate({ chatId: chat.id, projectId });
                }
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-900"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
