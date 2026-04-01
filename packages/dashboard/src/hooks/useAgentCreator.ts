import { useMutation } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Agent } from "../types.js";

export function useStartCreatorSession() {
  return useMutation({
    mutationFn: (projectId: string) =>
      api.post<{ sessionId: string }>(`/agent-creator/${projectId}/start`, {}),
  });
}

export function useSendCreatorMessage() {
  return useMutation({
    mutationFn: ({
      sessionId,
      content,
    }: {
      sessionId: string;
      content: string;
    }) => api.post(`/agent-creator/${sessionId}/message`, { content }),
  });
}

export function useConfirmAgent() {
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post<Agent>(`/agent-creator/${sessionId}/confirm`, {}),
  });
}

export function useCancelCreatorSession() {
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post(`/agent-creator/${sessionId}/cancel`, {}),
  });
}
