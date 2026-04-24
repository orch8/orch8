import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Comment } from "../types.js";

export function useComments(taskId: string | null, type?: string) {
  return useQuery<Comment[]>({
    queryKey: ["comments", taskId, type],
    queryFn: () => api.get(`/tasks/${taskId}/comments`, { type }),
    enabled: !!taskId,
  });
}

export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      author,
      body,
      type,
      notify,
    }: {
      taskId: string;
      author: string;
      body: string;
      type?: string;
      notify?: boolean;
    }) => api.post<Comment>(`/tasks/${taskId}/comments`, { author, body, type, notify }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["comments", vars.taskId] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api.delete(`/comments/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}
