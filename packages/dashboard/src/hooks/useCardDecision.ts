// packages/dashboard/src/hooks/useCardDecision.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { ChatMessage } from "./useChatMessages.js";

export function useCardDecision() {
  const qc = useQueryClient();
  return useMutation<
    ChatMessage,
    Error,
    {
      chatId: string;
      cardId: string;
      decision: "approved" | "cancelled";
      actor?: string;
    }
  >({
    mutationFn: ({ chatId, cardId, decision, actor }) =>
      api.post<ChatMessage>(`/chats/${chatId}/cards/${cardId}/decision`, {
        decision,
        actor,
      }),
    onSuccess: (_message, { chatId }) => {
      qc.invalidateQueries({ queryKey: ["chatMessages", chatId] });
    },
  });
}
