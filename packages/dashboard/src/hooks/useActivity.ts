import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { LogEntry } from "../types.js";

export function useActivity(
  projectId: string | null,
  opts?: { agentId?: string; taskId?: string; level?: string; limit?: number; offset?: number },
) {
  return useQuery<LogEntry[]>({
    queryKey: ["activity", projectId, opts],
    queryFn: () =>
      api.get("/log", {
        projectId: projectId ?? undefined,
        agentId: opts?.agentId,
        taskId: opts?.taskId,
        level: opts?.level,
        limit: opts?.limit ?? 100,
        offset: opts?.offset ?? 0,
      }),
    enabled: !!projectId,
  });
}
