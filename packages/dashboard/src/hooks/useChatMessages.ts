// packages/dashboard/src/hooks/useChatMessages.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ExtractedCard } from "@orch/shared";
import { api } from "../api/client.js";

export interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  cards: ExtractedCard[];
  skillInvoked: string | null;
  runId: string | null;
  status: "streaming" | "complete" | "error";
  createdAt: string;
  mentions?: string[];
}

export function useChatMessages(chatId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: ["chat-messages", chatId],
    queryFn: () => api.get(`/chats/${chatId}/messages`),
    enabled: chatId.length > 0,
  });
}

export function useSendChatMessage() {
  const qc = useQueryClient();
  return useMutation<
    ChatMessage,
    Error,
    { chatId: string; content: string; notify?: boolean }
  >({
    mutationFn: ({ chatId, content, notify }) =>
      api.post<ChatMessage>(`/chats/${chatId}/messages`, { content, notify }),
    onSuccess: (_message, { chatId }) => {
      // Refetch messages so the user row appears immediately. The
      // assistant row arrives via WebSocket and the chat_message_complete
      // handler in WsEventsProvider invalidates this same query.
      qc.invalidateQueries({ queryKey: ["chat-messages", chatId] });
    },
  });
}
