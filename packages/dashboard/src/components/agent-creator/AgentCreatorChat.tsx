import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStartCreatorSession,
  useSendCreatorMessage,
  useConfirmAgent,
  useCancelCreatorSession,
} from "../../hooks/useAgentCreator.js";
import { useWsEvents, type WsEvent } from "../../hooks/useWsEvents.js";
import { useToastStore } from "../../stores/toast.js";
import { AgentConfigCard } from "./AgentConfigCard.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AgentCreatorChatProps {
  projectId: string;
}

/** Extract JSON from ```agent-config``` fences in text. Returns last match or null. */
function extractConfigFromText(text: string): Record<string, unknown> | null {
  const regex = /```agent-config\s*\n([\s\S]*?)```/g;
  let lastMatch: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match[1].trim();
  }
  if (!lastMatch) return null;
  try {
    return JSON.parse(lastMatch);
  } catch {
    return null;
  }
}

/** Split text around ```agent-config``` fences into segments. */
function splitAroundConfig(text: string): Array<{ type: "text" | "config"; content: string }> {
  const segments: Array<{ type: "text" | "config"; content: string }> = [];
  const regex = /```agent-config\s*\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "config", content: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

export function AgentCreatorChat({ projectId }: AgentCreatorChatProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.add);
  const startSession = useStartCreatorSession();
  const sendMessage = useSendCreatorMessage();
  const confirmAgent = useConfirmAgent();
  const cancelSession = useCancelCreatorSession();
  const { subscribe } = useWsEvents();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [input, setInput] = useState("");
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-start session on mount
  useEffect(() => {
    if (!sessionId && !startSession.isPending) {
      startSession.mutate(projectId, {
        onSuccess: (data) => setSessionId(data.sessionId),
        onError: (err) => setError(err.message),
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to streaming output
  useEffect(() => {
    if (!sessionId) return;
    const unsubscribe = subscribe("agent_creator_output", (event: WsEvent) => {
      if (event.sessionId !== sessionId) return;
      setStreamBuffer((prev) => prev + (event.chunk as string));
    });
    return unsubscribe;
  }, [subscribe, sessionId]);

  // Convert buffer to message when streaming stops (1s debounce)
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !sessionId) return;
    const content = input.trim();
    setMessages((prev) => [...prev, { role: "user", content }]);
    sendMessage.mutate({ sessionId, content });
    setInput("");
  }

  function handleConfirm() {
    if (!sessionId) return;
    confirmAgent.mutate(sessionId, {
      onSuccess: (agent) => {
        qc.invalidateQueries({ queryKey: ["agents", projectId] });
        addToast({
          id: String(Date.now()),
          type: "task_completed",
          title: "Agent Created",
          message: `${agent.name} has been created successfully.`,
          link: `/projects/${projectId}/agents/${agent.id}`,
        });
        navigate({
          to: "/projects/$projectId/agents/$agentId",
          params: { projectId, agentId: agent.id },
        });
      },
      onError: (err) => {
        setError(`Failed to create agent: ${err.message}`);
      },
    });
  }

  function handleCancel() {
    if (!sessionId) return;
    cancelSession.mutate(sessionId, {
      onSuccess: () => {
        navigate({
          to: "/projects/$projectId/agents",
          params: { projectId },
        });
      },
    });
  }

  const renderMessageContent = useCallback(
    (content: string) => {
      const segments = splitAroundConfig(content);
      return segments.map((seg, i) => {
        if (seg.type === "config") {
          try {
            const config = JSON.parse(seg.content);
            return (
              <AgentConfigCard
                key={i}
                config={config}
                onConfirm={handleConfirm}
                isConfirming={confirmAgent.isPending}
              />
            );
          } catch {
            return (
              <pre key={i} className="rounded bg-zinc-900 p-2 text-xs text-zinc-400">
                {seg.content}
              </pre>
            );
          }
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {seg.content}
          </p>
        );
      });
    },
    [confirmAgent.isPending, sessionId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          Create Agent with AI
        </h3>
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="rounded bg-red-900/30 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50"
        >
          Cancel
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md bg-red-900/20 p-3 text-sm text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-200">dismiss</button>
        </div>
      )}

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
              {msg.role === "assistant"
                ? renderMessageContent(msg.content)
                : <p className="whitespace-pre-wrap">{msg.content}</p>}
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
            {sessionId
              ? "Starting AI agent creator... waiting for response."
              : "Initializing session..."}
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
          placeholder="Describe the agent you want to create..."
          disabled={!sessionId}
          className="flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={!input.trim() || !sessionId}
          className="rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-40"
        >
          Send
        </button>
      </form>

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel Agent Creation?"
        description="This will end the session and discard any progress."
        confirmLabel="Cancel Session"
        onConfirm={() => {
          handleCancel();
          setShowCancelConfirm(false);
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}
