import { z } from "zod";

export const AddBundledAgentsSchema = z.object({
  projectId: z.string().min(1),
  agentIds: z.array(z.string().min(1)).min(1),
});

export interface BundledAgent {
  id: string;
  name: string;
  role: string;
  model: string;
  effort?: string;
  maxTurns: number;
  skills: string[];
  heartbeatEnabled: boolean;
  heartbeatIntervalSec?: number;
  systemPrompt: string;
  promptTemplate?: string;
  bootstrapPromptTemplate?: string;
}
