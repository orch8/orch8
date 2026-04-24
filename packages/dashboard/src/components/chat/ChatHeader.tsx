// packages/dashboard/src/components/chat/ChatHeader.tsx
import { useState } from "react";
import type { Chat } from "../../hooks/useChats.js";
import { useUpdateChat, useDeleteChat } from "../../hooks/useChats.js";
import { Link } from "@tanstack/react-router";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { useUiStore } from "../../stores/ui.js";

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
  const { isNarrow } = useBreakpoint();
  const openDrawer = useUiStore((s) => s.openDrawer);

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
    <div className="flex items-center justify-between border-b border-edge-soft bg-canvas px-4 py-3">
      <div className="flex items-center gap-3">
        {isNarrow && (
          <button
            onClick={() => openDrawer("threads")}
            className="focus-ring shrink-0 rounded-sm px-2 py-1 type-ui text-mute hover:text-ink"
          >
            Threads
          </button>
        )}
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
            className="focus-ring rounded-sm border border-edge bg-surface px-2 py-1 type-section text-ink"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="focus-ring type-section text-ink hover:text-accent"
            title="Click to rename"
          >
            {chat.title}
          </button>
        )}
        <Link
          to="/projects/$projectSlug/agents/$agentId"
          params={{ projectSlug: projectId, agentId: chat.agentId }}
          className="focus-ring type-mono text-blue underline decoration-blue/40 decoration-dotted underline-offset-2 hover:decoration-blue"
        >
          {chat.agentId}
        </Link>
      </div>

      <div className="relative">
        <button
          aria-label="Thread menu"
          onClick={() => setMenuOpen((o) => !o)}
          className="focus-ring rounded-sm px-2 py-1 text-mute hover:bg-surface-2 hover:text-ink"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-edge-soft bg-surface shadow-lg">
            <button
              onClick={() => {
                updateChat.mutate({
                  chatId: chat.id,
                  patch: { pinned: !chat.pinned },
                });
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-2 text-left type-body text-ink hover:bg-surface-2"
            >
              {chat.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={() => {
                updateChat.mutate({
                  chatId: chat.id,
                  patch: { archived: true },
                });
                setMenuOpen(false);
              }}
              className="block w-full px-3 py-2 text-left type-body text-ink hover:bg-surface-2"
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
              className="block w-full px-3 py-2 text-left type-body text-red hover:bg-surface-2"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
