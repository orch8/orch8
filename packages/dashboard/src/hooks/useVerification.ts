import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

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
      taskType: "quick";
    }) => api.post(`/tasks/${taskId}/convert`, { taskType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
