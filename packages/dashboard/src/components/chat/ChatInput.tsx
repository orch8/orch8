import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useSendChatMessage } from "../../hooks/useChatMessages.js";

interface ChatInputProps {
  chatId: string;
}

export function ChatInput({ chatId }: ChatInputProps) {
  const [value, setValue] = useState("");
  const sendMessage = useSendChatMessage();

  const canSend = value.trim().length > 0 && !sendMessage.isPending;

  function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!canSend) return;
    const content = value.trim();
    sendMessage.mutate(
      { chatId, content },
      { onSuccess: () => setValue("") },
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-zinc-800 bg-zinc-950 px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message…"
          rows={1}
          className="flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className="rounded-md bg-sky-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
        >
          Send
        </button>
      </div>
    </form>
  );
}
