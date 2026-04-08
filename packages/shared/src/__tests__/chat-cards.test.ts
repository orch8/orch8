import { describe, it, expect } from "vitest";
import {
  ChatCardSchema,
  ALL_CARD_KINDS,
  type ChatCardKind,
} from "../schemas/chat-cards.js";
import { parseStrictCard } from "../schemas/chat.js";

/**
 * Fixture generator: returns one valid card for each kind. Edit this
 * map when adding a new kind. The "every-kind has a fixture" test
 * below catches missing entries.
 */
const fixtures: Record<ChatCardKind, unknown> = {
  confirm_create_task: {
    kind: "confirm_create_task",
    summary: "Create T",
    payload: { title: "T", priority: "medium" },
  },
  confirm_update_task: {
    kind: "confirm_update_task",
    summary: "Update T",
    payload: {
      taskId: "task_a",
      current: { title: "Old" },
      proposed: { title: "New" },
    },
  },
  confirm_assign_task: {
    kind: "confirm_assign_task",
    summary: "Assign T to engineer",
    payload: { taskId: "task_a", currentAssignee: null, proposedAssignee: "engineer" },
  },
  confirm_move_task: {
    kind: "confirm_move_task",
    summary: "Move T",
    payload: { taskId: "task_a", from: "backlog", to: "in_progress" },
  },
  confirm_convert_task: {
    kind: "confirm_convert_task",
    summary: "Convert T",
    payload: { taskId: "task_a", from: "brainstorm", to: "quick" },
  },
  confirm_kill_task: {
    kind: "confirm_kill_task",
    summary: "Kill T",
    payload: { taskId: "task_a", currentRunId: "run_x" },
  },
  confirm_delete_task: {
    kind: "confirm_delete_task",
    summary: "Delete T",
    payload: { taskId: "task_a", title: "T" },
  },

  confirm_create_agent: {
    kind: "confirm_create_agent",
    summary: "Create qa-bot",
    payload: {
      id: "qa-bot",
      name: "QA Bot",
      role: "qa",
      model: "claude-sonnet-4-6",
      heartbeatEnabled: true,
      heartbeatIntervalSec: 21600,
      // null (not undefined) — LLMs naturally emit JSON null for
      // unset numeric fields. AgentPatchSchema already accepts null,
      // so keep AgentCreateInputSchema consistent.
      budgetLimitUsd: null,
    },
  },
  confirm_update_agent: {
    kind: "confirm_update_agent",
    summary: "Update qa-bot",
    payload: {
      agentId: "qa-bot",
      current: { maxTurns: 25 },
      proposed: { maxTurns: 50 },
    },
  },
  confirm_pause_agent: {
    kind: "confirm_pause_agent",
    summary: "Pause qa-bot",
    payload: { agentId: "qa-bot", name: "QA Bot" },
  },
  confirm_resume_agent: {
    kind: "confirm_resume_agent",
    summary: "Resume qa-bot",
    payload: { agentId: "qa-bot", name: "QA Bot" },
  },
  confirm_delete_agent: {
    kind: "confirm_delete_agent",
    summary: "Delete qa-bot",
    payload: { agentId: "qa-bot", name: "QA Bot" },
  },

  confirm_create_pipeline: {
    kind: "confirm_create_pipeline",
    summary: "Create pipeline P",
    payload: {
      name: "P",
      steps: [{ order: 1, label: "Plan", defaultAgentId: "planner" }],
    },
  },
  confirm_update_pipeline: {
    kind: "confirm_update_pipeline",
    summary: "Update P",
    payload: { pipelineId: "pipe_a", current: {}, proposed: { name: "Q" } },
  },
  confirm_run_pipeline: {
    kind: "confirm_run_pipeline",
    summary: "Run P",
    payload: { pipelineId: "pipe_a", name: "P" },
  },
  confirm_delete_pipeline: {
    kind: "confirm_delete_pipeline",
    summary: "Delete P",
    payload: { pipelineId: "pipe_a", name: "P" },
  },

  confirm_kill_run: {
    kind: "confirm_kill_run",
    summary: "Kill run_a",
    payload: { runId: "run_a", agentName: "Engineer", runningSinceSec: 120 },
  },
  confirm_retry_run: {
    kind: "confirm_retry_run",
    summary: "Retry run_a",
    payload: { runId: "run_a", agentName: "Engineer" },
  },

  confirm_set_budget: {
    kind: "confirm_set_budget",
    summary: "Set budget",
    payload: {
      scope: "agent",
      entityId: "qa-bot",
      current: { budgetLimitUsd: null },
      proposed: { budgetLimitUsd: 5 },
    },
  },

  confirm_update_memory_entity: {
    kind: "confirm_update_memory_entity",
    summary: "Update entity",
    payload: {
      entityId: "ent_a",
      current: { description: "old" },
      proposed: { description: "new" },
    },
  },
  confirm_add_lesson: {
    kind: "confirm_add_lesson",
    summary: "Add lesson",
    payload: { title: "L", body: "Body of the lesson." },
  },

  info_task_list: {
    kind: "info_task_list",
    summary: "1 task",
    payload: {
      tasks: [{ id: "task_a", title: "T", column: "backlog" }],
    },
  },
  info_task_detail: {
    kind: "info_task_detail",
    summary: "Task T",
    payload: { task: { id: "task_a", title: "T", column: "backlog" } },
  },
  info_agent_list: {
    kind: "info_agent_list",
    summary: "1 agent",
    payload: {
      agents: [{ id: "qa-bot", name: "QA Bot", role: "qa", model: "claude-sonnet-4-6", status: "active" }],
    },
  },
  info_agent_detail: {
    kind: "info_agent_detail",
    summary: "Agent qa-bot",
    payload: {
      agent: { id: "qa-bot", name: "QA Bot", role: "qa", model: "claude-sonnet-4-6", status: "active" },
    },
  },
  info_run_list: {
    kind: "info_run_list",
    summary: "1 run",
    payload: {
      runs: [{ id: "run_a", agentId: "qa-bot", status: "succeeded", startedAt: "2026-04-07T10:00:00Z" }],
    },
  },
  info_run_detail: {
    kind: "info_run_detail",
    summary: "Run run_a",
    payload: {
      run: { id: "run_a", agentId: "qa-bot", status: "succeeded", startedAt: "2026-04-07T10:00:00Z" },
    },
  },
  info_cost_summary: {
    kind: "info_cost_summary",
    summary: "$1 spent",
    payload: {
      projectId: "proj_a",
      totalSpentUsd: 1,
      byAgent: [{ agentId: "qa-bot", name: "QA Bot", spentUsd: 1 }],
    },
  },
  info_budget_status: {
    kind: "info_budget_status",
    summary: "1 entry",
    payload: {
      entries: [
        {
          entityId: "qa-bot",
          name: "QA Bot",
          scope: "agent",
          limitUsd: 5,
          spentUsd: 1,
          percentUsed: 20,
          paused: false,
        },
      ],
    },
  },
  info_pipeline_list: {
    kind: "info_pipeline_list",
    summary: "1 pipeline",
    payload: {
      pipelines: [{ id: "pipe_a", name: "P", stepCount: 3 }],
    },
  },
  info_pipeline_run_history: {
    kind: "info_pipeline_run_history",
    summary: "1 run",
    payload: {
      pipelineId: "pipe_a",
      runs: [{ runId: "prun_a", status: "succeeded", startedAt: "2026-04-07T10:00:00Z" }],
    },
  },
  info_memory_search: {
    kind: "info_memory_search",
    summary: "2 results",
    payload: {
      query: "auth",
      results: [
        { kind: "fact", id: "fact_a", snippet: "..." },
        { kind: "lesson", id: "lesson_b", snippet: "..." },
      ],
    },
  },

  result_create_task:     { kind: "result_create_task",     summary: "Created", payload: { entityId: "task_a", entityKind: "task" } },
  result_update_task:     { kind: "result_update_task",     summary: "Updated", payload: { entityId: "task_a", fieldsChanged: ["title"] } },
  result_delete_task:     { kind: "result_delete_task",     summary: "Deleted", payload: { entityId: "task_a" } },
  result_create_agent:    { kind: "result_create_agent",    summary: "Created", payload: { entityId: "qa-bot" } },
  result_update_agent:    { kind: "result_update_agent",    summary: "Updated", payload: { entityId: "qa-bot" } },
  result_pause_agent:     { kind: "result_pause_agent",     summary: "Paused",  payload: { entityId: "qa-bot" } },
  result_resume_agent:    { kind: "result_resume_agent",    summary: "Resumed", payload: { entityId: "qa-bot" } },
  result_delete_agent:    { kind: "result_delete_agent",    summary: "Deleted", payload: { entityId: "qa-bot" } },
  result_create_pipeline: { kind: "result_create_pipeline", summary: "Created", payload: { entityId: "pipe_a" } },
  result_update_pipeline: { kind: "result_update_pipeline", summary: "Updated", payload: { entityId: "pipe_a" } },
  result_run_pipeline:    { kind: "result_run_pipeline",    summary: "Started", payload: { entityId: "prun_a" } },
  result_delete_pipeline: { kind: "result_delete_pipeline", summary: "Deleted", payload: { entityId: "pipe_a" } },
  result_kill_run:        { kind: "result_kill_run",        summary: "Killed",  payload: { entityId: "run_a" } },
  result_retry_run:       { kind: "result_retry_run",       summary: "Retried", payload: { entityId: "run_b" } },
  result_set_budget:      { kind: "result_set_budget",      summary: "Set",     payload: { entityId: "qa-bot" } },
  result_add_lesson:      { kind: "result_add_lesson",      summary: "Added",   payload: { entityId: "lesson_a" } },
  result_update_memory_entity: { kind: "result_update_memory_entity", summary: "Updated", payload: { entityId: "ent_a" } },

  result_error: {
    kind: "result_error",
    summary: "Failed",
    payload: { reason: "boom", httpStatus: 500, endpoint: "/api/agents" },
  },
};

describe("ChatCardSchema", () => {
  it("ALL_CARD_KINDS has a fixture for every kind", () => {
    for (const kind of ALL_CARD_KINDS) {
      expect(fixtures, `missing fixture for ${kind}`).toHaveProperty(kind);
    }
  });

  for (const kind of ALL_CARD_KINDS) {
    describe(`kind: ${kind}`, () => {
      it("parses its fixture cleanly", () => {
        const parsed = ChatCardSchema.safeParse(fixtures[kind]);
        if (!parsed.success) {
          throw new Error(
            `${kind} fixture failed validation: ${JSON.stringify(parsed.error.issues, null, 2)}`,
          );
        }
        expect(parsed.data.kind).toBe(kind);
      });

      it("round-trips through JSON.stringify/parse", () => {
        const card = ChatCardSchema.parse(fixtures[kind]);
        const roundTripped = JSON.parse(JSON.stringify(card));
        const reparsed = ChatCardSchema.safeParse(roundTripped);
        expect(reparsed.success).toBe(true);
      });
    });
  }

  it("rejects an unknown kind with a discriminator error", () => {
    const result = ChatCardSchema.safeParse({
      kind: "confirm_destroy_universe",
      summary: "uh oh",
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects a card whose payload shape is wrong for its kind", () => {
    const result = ChatCardSchema.safeParse({
      kind: "confirm_move_task",
      summary: "broken",
      payload: { taskId: "task_a" }, // missing from/to
    });
    expect(result.success).toBe(false);
  });

  it("rejects a card missing the summary field", () => {
    const result = ChatCardSchema.safeParse({
      kind: "info_task_list",
      payload: { tasks: [] },
    });
    expect(result.success).toBe(false);
  });
});

describe("parseStrictCard", () => {
  it("returns ok=true for a valid card", () => {
    const result = parseStrictCard({
      kind: "info_task_list",
      summary: "0 tasks",
      payload: { tasks: [] },
    });
    expect(result.ok).toBe(true);
  });

  it("returns ok=false with issues for an invalid card", () => {
    const result = parseStrictCard({
      kind: "info_task_list",
      summary: "missing payload",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
