import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";
import type { Task } from "../types.js";
import type { CreateTask, UpdateTask } from "@orch/shared";

export function useTasks(projectId: string | null) {
  return useQuery<Task[]>({
    queryKey: ["tasks", projectId],
    queryFn: () =>
      api.get("/tasks", projectId ? { projectId } : undefined),
  });
}

export function useTask(taskId: string | null) {
  return useQuery<Task>({
    queryKey: ["task", taskId],
    queryFn: () => api.get(`/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTask) => api.post<Task>("/tasks", input),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ["tasks", task.projectId] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...input }: UpdateTask & { taskId: string }) =>
      api.patch<Task>(`/tasks/${taskId}`, input),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ["tasks", task.projectId] });
      qc.invalidateQueries({ queryKey: ["task", task.id] });
    },
  });
}

export function useTransitionTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      column,
    }: {
      taskId: string;
      column: string;
    }) => api.post<Task>(`/tasks/${taskId}/transition`, { column }),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ["tasks", task.projectId] });
      qc.invalidateQueries({ queryKey: ["task", task.id] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.delete<void>(`/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
