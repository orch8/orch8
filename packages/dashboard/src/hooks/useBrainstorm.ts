import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../api/client.js";

export function useBrainstormTranscript(taskId: string | null) {
  return useQuery<{ transcript: string }>({
    queryKey: ["brainstormTranscript", taskId],
    queryFn: () => api.get(`/brainstorm/${taskId}/transcript`),
    enabled: !!taskId,
  });
}

export function useStartBrainstorm() {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/brainstorm/${taskId}/start`, {}),
  });
}

export function useSendBrainstormMessage() {
  return useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      api.post(`/brainstorm/${taskId}/message`, { content }),
  });
}

export function useMarkBrainstormReady() {
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/brainstorm/${taskId}/ready`, {}),
  });
}
