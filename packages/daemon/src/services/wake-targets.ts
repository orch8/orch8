export function resolveWakeTargets(input: {
  authorAgentId: string | null;
  mentionedAgentIds: string[];
  taskAssigneeAgentId?: string | null;
  notifyEnabled: boolean;
}): Array<{ agentId: string; reason: "mention" | "assignment" }> {
  if (!input.notifyEnabled) return [];

  const authorAgentId = input.authorAgentId ?? null;
  if (input.mentionedAgentIds.length > 0) {
    const seen = new Set<string>();
    const targets: Array<{ agentId: string; reason: "mention" }> = [];
    for (const agentId of input.mentionedAgentIds) {
      if (agentId === authorAgentId || seen.has(agentId)) continue;
      seen.add(agentId);
      targets.push({ agentId, reason: "mention" });
    }
    return targets;
  }

  if (
    input.taskAssigneeAgentId
    && input.taskAssigneeAgentId !== authorAgentId
  ) {
    return [{ agentId: input.taskAssigneeAgentId, reason: "assignment" }];
  }

  return [];
}
