import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

export function useAddDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      dependsOnId,
    }: {
      taskId: string;
      dependsOnId: string;
    }) => api.post(`/tasks/${taskId}/dependencies`, { dependsOnId }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["task", vars.taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useRemoveDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      dependsOnId,
    }: {
      taskId: string;
      dependsOnId: string;
    }) => api.delete(`/tasks/${taskId}/dependencies/${dependsOnId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["task", vars.taskId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
