import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { DaemonStatus } from "@orch/shared";

export interface DaemonConfig {
  orchestrator: { tick_interval_ms: number; log_level: string };
  api: { port: number; host: string };
  database: { host: string; port: number; name: string; user: string; pool_min: number; pool_max: number; auto_migrate: boolean };
  defaults: { model: string; max_turns: number; auto_commit: boolean; auto_pr: boolean; verification_required: boolean; brainstorm_idle_timeout_min: number };
  limits: { max_concurrent_agents: number; max_concurrent_per_project: number; max_spawns_per_hour: number; cooldown_on_failure: number };
  memory: { extraction_on_session_end: boolean; summary_rewrite_schedule: string; fact_decay_days: number };
}

export function useDaemonStatus() {
  return useQuery<DaemonStatus>({
    queryKey: ["daemonStatus"],
    queryFn: () => api.get("/daemon/status"),
    refetchInterval: 10_000,
  });
}

export function useDaemonConfig() {
  return useQuery<DaemonConfig>({
    queryKey: ["daemonConfig"],
    queryFn: () => api.get("/daemon/config"),
  });
}

export function useUpdateDaemonConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch("/daemon/config", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daemonConfig"] });
    },
  });
}

export function useRestartDaemon() {
  return useMutation({
    mutationFn: () => api.post("/daemon/restart", {}),
  });
}
