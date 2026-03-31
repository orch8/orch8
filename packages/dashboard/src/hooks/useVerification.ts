import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

export function useSpawnVerifier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/tasks/${taskId}/spawn-verifier`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useSpawnReferee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/tasks/${taskId}/spawn-referee`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      api.post(`/tasks/${taskId}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useConvertTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      taskType,
    }: {
      taskId: string;
      taskType: "quick" | "complex";
    }) => api.post(`/tasks/${taskId}/convert`, { taskType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
