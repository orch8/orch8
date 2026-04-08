import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useSendChatMessage } from "../../hooks/useChatMessages.js";
import { Button } from "../ui/Button.js";

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
      className="border-t border-edge-soft bg-canvas px-4 py-3"
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message…"
          rows={1}
          aria-label="Message"
          className="focus-ring flex-1 resize-none rounded-sm border border-edge bg-surface px-3 py-2 type-body text-ink placeholder:text-whisper"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!canSend}
          aria-label="Send"
        >
          Send
        </Button>
      </div>
    </form>
  );
}
