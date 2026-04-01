import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client.js";

interface InstructionBundle {
  id: string;
  agentId: string;
  projectId: string;
  mode: string;
  rootPath: string;
  entryFile: string;
  fileInventory: Array<{ path: string; size: number; updatedAt: string }>;
}

interface BundleFile {
  path: string;
  size: number;
  updatedAt: string;
}

export function useInstructionBundle(agentId: string, projectId: string) {
  return useQuery({
    queryKey: ["instructionBundle", agentId, projectId],
    queryFn: () =>
      api.get<InstructionBundle>(`/agents/${agentId}/instructions`, { projectId }),
    staleTime: 5_000,
    retry: false,
  });
}

export function useBundleFiles(agentId: string, projectId: string) {
  return useQuery({
    queryKey: ["bundleFiles", agentId, projectId],
    queryFn: () =>
      api.get<BundleFile[]>(`/agents/${agentId}/instructions/files`, { projectId }),
    staleTime: 5_000,
  });
}

export function useBundleFileContent(agentId: string, projectId: string, path: string | null) {
  return useQuery({
    queryKey: ["bundleFile", agentId, projectId, path],
    queryFn: () =>
      api.get<{ content: string }>(`/agents/${agentId}/instructions/files/${path}`, { projectId }),
    enabled: !!path,
    staleTime: 5_000,
  });
}

export function useWriteBundleFile(agentId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.put(`/agents/${agentId}/instructions/files/${path}?projectId=${projectId}`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bundleFiles", agentId, projectId] });
    },
  });
}

export function useUpdateBundleMode(agentId: string, projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: string; rootPath?: string; entryFile?: string }) =>
      api.patch(`/agents/${agentId}/instructions?projectId=${projectId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructionBundle", agentId, projectId] });
    },
  });
}
