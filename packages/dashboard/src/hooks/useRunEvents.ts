import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../api/client.js";
import type { RunEvent } from "../types.js";
import { useWsEvents } from "./WsEventsProvider.js";

export function useRunEvents(runId: string | null, projectId: string) {
  return useQuery<RunEvent[]>({
    queryKey: ["run-events", runId, projectId],
    queryFn: () => api.get(`/runs/${runId}/events`, { projectId }),
    enabled: !!runId,
  });
}

export function useRunEventStream(
  runId: string | null,
  projectId: string,
  runStatus?: string,
) {
  const qc = useQueryClient();
  const { subscribe } = useWsEvents();

  const isLive = runStatus === "running" || runStatus === "queued";

  useEffect(() => {
    if (!runId || !isLive) return;

    const unsub = subscribe("run_event", (event) => {
      if (event.runId !== runId) return;

      qc.setQueryData<RunEvent[]>(["run-events", runId, projectId], (old) => {
        if (!old) return [event as unknown as RunEvent];

        // Deduplicate by seq
        const exists = old.some((e) => e.seq === (event as any).seq);
        if (exists) return old;

        const updated = [...old, event as unknown as RunEvent];
        updated.sort((a, b) => a.seq - b.seq);
        return updated;
      });
    });

    return unsub;
  }, [runId, projectId, isLive, qc, subscribe]);
}
