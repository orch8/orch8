import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useSendChatMessage } from "../../hooks/useChatMessages.js";
import { Button } from "../ui/Button.js";
import { Switch } from "../ui/Switch.js";

interface ChatInputProps {
  chatId: string;
}

export function ChatInput({ chatId }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [notify, setNotify] = useState(true);
  const sendMessage = useSendChatMessage();

  const canSend = value.trim().length > 0 && !sendMessage.isPending;

  function handleSubmit(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!canSend) return;
    const content = value.trim();
    sendMessage.mutate(
      { chatId, content, notify },
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
      className="border-t border-edge-soft bg-canvas px-[var(--pad-page)] py-3 max-sm:sticky max-sm:bottom-0 max-sm:py-0 max-sm:pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <label className="flex items-center gap-2 self-start text-xs text-mute">
          <Switch checked={notify} onCheckedChange={setNotify} aria-label="Notify agent" />
          Notify agent
        </label>
        <div className="flex items-end gap-2">
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
      </div>
    </form>
  );
}
