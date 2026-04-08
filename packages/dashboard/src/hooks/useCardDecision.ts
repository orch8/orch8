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
      projectId: string;
      decision: "approved" | "cancelled";
      actor?: string;
    }
  >({
    // projectId is required: the daemon's decideCard route (chats.ts) scopes
    // card approvals to the caller's project to close an auth hole where any
    // localhost caller could approve cards in arbitrary projects by guessing
    // chat/card IDs. We pass it as a query param (matching the useAgents
    // pattern) — the admin auth path reads it from request.query.projectId.
    mutationFn: ({ chatId, cardId, projectId, decision, actor }) =>
      api.post<ChatMessage>(
        `/chats/${chatId}/cards/${cardId}/decision`,
        { decision, actor },
        { projectId },
      ),
    onSuccess: (_message, { chatId }) => {
      qc.invalidateQueries({ queryKey: ["chatMessages", chatId] });
    },
  });
}
