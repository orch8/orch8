import { useState, useEffect, useRef, useCallback } from "react";
import {
  useBrainstormTranscript,
  useStartBrainstorm,
  useSendBrainstormMessage,
  useMarkBrainstormReady,
} from "../../hooks/useBrainstorm.js";
import { useWsEvents, type WsEvent } from "../../hooks/useWsEvents.js";
import { api } from "../../api/client.js";
import type { Task } from "../../types.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface BrainstormChatProps {
  taskId: string;
}

export function BrainstormChat({ taskId }: BrainstormChatProps) {
  const { data: transcriptData } = useBrainstormTranscript(taskId);
  const startBrainstorm = useStartBrainstorm();
  const sendMessage = useSendBrainstormMessage();
  const markReady = useMarkBrainstormReady();
  const { subscribe } = useWsEvents();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [input, setInput] = useState("");
  const [started, setStarted] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to brainstorm output chunks
  useEffect(() => {
    const unsubscribe = subscribe("brainstorm_output", (event: WsEvent) => {
      if (event.taskId !== taskId) return;
      const chunk = event.chunk as string;
      setStreamBuffer((prev) => prev + chunk);
    });
    return unsubscribe;
  }, [subscribe, taskId]);

  // When streaming stops, convert buffer to message
  useEffect(() => {
    if (streamBuffer) {
      const timer = setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: streamBuffer },
        ]);
        setStreamBuffer("");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [streamBuffer]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  function handleStart() {
    startBrainstorm.mutate(taskId, {
      onSuccess: () => setStarted(true),
    });
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const content = input.trim();
    setMessages((prev) => [...prev, { role: "user", content }]);
    sendMessage.mutate({ taskId, content });
    setInput("");
  }

  function handleMarkReady() {
    markReady.mutate(taskId);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          Brainstorm Session
        </h3>
        <div className="flex gap-2">
          {!started && (
            <button
              onClick={handleStart}
              disabled={startBrainstorm.isPending}
              className="rounded bg-blue-900/30 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-900/50 disabled:opacity-40"
            >
              {startBrainstorm.isPending ? "Starting..." : "Start Session"}
            </button>
          )}
          <button
            onClick={handleMarkReady}
            disabled={markReady.isPending}
            className="rounded bg-emerald-900/30 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-40"
          >
            Mark as Ready
          </button>
          <button
            onClick={() =>
              api.post<Task>(`/tasks/${taskId}/convert`, { taskType: "quick" })
            }
            className="rounded bg-blue-900/30 px-3 py-1 text-xs font-medium text-blue-300 hover:bg-blue-900/50"
          >
            Convert to Quick
          </button>
          <button
            onClick={() => setShowKillConfirm(true)}
            className="rounded bg-red-900/30 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50"
          >
            Kill
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "ml-auto bg-blue-900/30 text-blue-100"
                  : "mr-auto bg-zinc-800 text-zinc-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}

          {/* Streaming buffer */}
          {streamBuffer && (
            <div className="mr-auto max-w-[80%] rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200">
              <p className="whitespace-pre-wrap">{streamBuffer}</p>
              <span className="inline-block h-4 w-1 animate-pulse bg-zinc-400" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {messages.length === 0 && !streamBuffer && (
          <p className="text-center text-sm text-zinc-600">
            {started
              ? "Session started. Waiting for response..."
              : "Start a brainstorm session to begin chatting."}
          </p>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="flex gap-2 border-t border-zinc-800 pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={!started}
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!input.trim() || !started}
          className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
        >
          Send
        </button>
      </form>

      <ConfirmDialog
        open={showKillConfirm}
        title="Kill Brainstorm Session?"
        description="This will terminate the brainstorm process."
        confirmLabel="Kill"
        onConfirm={async () => {
          await api.post(`/brainstorm/${taskId}/kill`, {});
          setShowKillConfirm(false);
        }}
        onCancel={() => setShowKillConfirm(false)}
      />
    </div>
  );
}
