import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Notification } from "../types.js";

export function useNotifications(projectId: string | null, opts?: { unread?: boolean }) {
  return useQuery<Notification[]>({
    queryKey: ["notifications", projectId, opts?.unread],
    queryFn: () =>
      api.get("/notifications", {
        projectId: projectId ?? undefined,
        unread: opts?.unread,
      }),
    enabled: !!projectId,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) =>
      api.post("/notifications/read", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
