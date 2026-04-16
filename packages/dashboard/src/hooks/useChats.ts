import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

export interface Chat {
  id: string;
  projectId: string;
  agentId: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export function useChats(projectId: string, opts?: { includeArchived?: boolean }) {
  return useQuery<Chat[]>({
    queryKey: ["chats", projectId, opts?.includeArchived ?? false],
    queryFn: () =>
      api.get(`/projects/${projectId}/chats`, {
        includeArchived: opts?.includeArchived ? "true" : undefined,
      }),
  });
}

export function useChat(chatId: string) {
  return useQuery<Chat>({
    queryKey: ["chat", chatId],
    queryFn: () => api.get(`/chats/${chatId}`),
    enabled: chatId.length > 0,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation<Chat, Error, { projectId: string; agentId?: string; title?: string; seedMessage?: string }>({
    mutationFn: (input) =>
      api.post<Chat>(`/projects/${input.projectId}/chats`, {
        projectId: input.projectId,
        agentId: input.agentId,
        title: input.title,
        seedMessage: input.seedMessage,
      }),
    onSuccess: (chat) => {
      qc.invalidateQueries({ queryKey: ["chats", chat.projectId] });
    },
  });
}

export function useUpdateChat() {
  const qc = useQueryClient();
  return useMutation<
    Chat,
    Error,
    { chatId: string; patch: { title?: string; pinned?: boolean; archived?: boolean } }
  >({
    mutationFn: ({ chatId, patch }) => api.patch<Chat>(`/chats/${chatId}`, patch),
    onSuccess: (chat) => {
      qc.invalidateQueries({ queryKey: ["chats", chat.projectId] });
      qc.invalidateQueries({ queryKey: ["chat", chat.id] });
    },
  });
}

export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation<void, Error, { chatId: string; projectId: string }>({
    mutationFn: ({ chatId }) => api.delete(`/chats/${chatId}`),
    onSuccess: (_void, { projectId, chatId }) => {
      qc.invalidateQueries({ queryKey: ["chats", projectId] });
      qc.removeQueries({ queryKey: ["chat", chatId] });
    },
  });
}
