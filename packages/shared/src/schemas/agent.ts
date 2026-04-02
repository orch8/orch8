import { z } from "zod";
import { TaskColumnSchema } from "./task.js";

export const AgentRoleSchema = z.enum([
  "cto", "engineer", "qa", "researcher", "planner",
  "implementer", "reviewer", "verifier", "referee", "custom",
]);

export const AgentStatusSchema = z.enum(["active", "paused", "terminated"]);

export const CreateAgentSchema = z.object({
  id: z.string().min(1).max(100),
  projectId: z.string().min(1),
  name: z.string().min(1).max(200),
  role: AgentRoleSchema,
  icon: z.string().optional(),
  color: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  maxTurns: z.number().int().min(1).optional(),
  allowedTools: z.array(z.string()).optional(),
  heartbeatEnabled: z.boolean().optional(),
  heartbeatIntervalSec: z.number().int().min(0).optional(),
  wakeOnAssignment: z.boolean().optional(),
  wakeOnOnDemand: z.boolean().optional(),
  wakeOnAutomation: z.boolean().optional(),
  maxConcurrentRuns: z.number().int().min(1).optional(),
  canAssignTo: z.array(z.string()).optional(),
  canCreateTasks: z.boolean().optional(),
  canMoveTo: z.array(TaskColumnSchema).optional(),
  systemPrompt: z.string().optional(),
  promptTemplate: z.string().optional(),
  bootstrapPromptTemplate: z.string().optional(),
  instructionsFilePath: z.string().optional(),
  mcpTools: z.array(z.string()).optional(),
  desiredSkills: z.array(z.string()).optional(),
  adapterType: z.string().optional(),
  adapterConfig: z.record(z.unknown()).optional(),
  envVars: z.record(z.string()).optional(),
  budgetLimitUsd: z.number().min(0).optional(),
  autoPauseThreshold: z.number().int().min(0).max(100).optional(),
  maxConcurrentTasks: z.number().int().min(1).optional(),
  maxConcurrentSubagents: z.number().int().min(0).optional(),
  workingHours: z.string().optional(),
});

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: AgentRoleSchema.optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().nullable().optional(),
  maxTurns: z.number().int().min(1).optional(),
  allowedTools: z.array(z.string()).optional(),
  heartbeatEnabled: z.boolean().optional(),
  heartbeatIntervalSec: z.number().int().min(0).optional(),
  wakeOnAssignment: z.boolean().optional(),
  wakeOnOnDemand: z.boolean().optional(),
  wakeOnAutomation: z.boolean().optional(),
  maxConcurrentRuns: z.number().int().min(1).optional(),
  canAssignTo: z.array(z.string()).optional(),
  canCreateTasks: z.boolean().optional(),
  canMoveTo: z.array(TaskColumnSchema).optional(),
  systemPrompt: z.string().optional(),
  promptTemplate: z.string().optional(),
  bootstrapPromptTemplate: z.string().optional(),
  instructionsFilePath: z.string().nullable().optional(),
  mcpTools: z.array(z.string()).optional(),
  desiredSkills: z.array(z.string()).optional(),
  adapterType: z.string().optional(),
  adapterConfig: z.record(z.unknown()).optional(),
  envVars: z.record(z.string()).optional(),
  budgetLimitUsd: z.number().min(0).nullable().optional(),
  autoPauseThreshold: z.number().int().min(0).max(100).nullable().optional(),
  maxConcurrentTasks: z.number().int().min(1).optional(),
  maxConcurrentSubagents: z.number().int().min(0).optional(),
  workingHours: z.string().nullable().optional(),
});

export const AgentFilterSchema = z.object({
  projectId: z.string().optional(),
  role: AgentRoleSchema.optional(),
  status: AgentStatusSchema.optional(),
});

export const CloneAgentSchema = z.object({
  targetProjectId: z.string().min(1),
  newId: z.string().min(1).max(100),
});
