import type { ComponentType } from "react";
import { parseStrictCard } from "@orch/shared";
import type { ChatCardKind, ExtractedCard } from "@orch/shared";
import type { CardComponentProps } from "./cardTypes.js";

import { ConfirmCreateTaskCard } from "./confirm/ConfirmCreateTaskCard.js";
import { ConfirmUpdateTaskCard } from "./confirm/ConfirmUpdateTaskCard.js";
import { ConfirmAssignTaskCard } from "./confirm/ConfirmAssignTaskCard.js";
import { ConfirmMoveTaskCard } from "./confirm/ConfirmMoveTaskCard.js";
import { ConfirmConvertTaskCard } from "./confirm/ConfirmConvertTaskCard.js";
import { ConfirmKillTaskCard } from "./confirm/ConfirmKillTaskCard.js";
import { ConfirmDeleteTaskCard } from "./confirm/ConfirmDeleteTaskCard.js";
import { ConfirmCreateAgentCard } from "./confirm/ConfirmCreateAgentCard.js";
import { ConfirmUpdateAgentCard } from "./confirm/ConfirmUpdateAgentCard.js";
import { ConfirmPauseAgentCard } from "./confirm/ConfirmPauseAgentCard.js";
import { ConfirmResumeAgentCard } from "./confirm/ConfirmResumeAgentCard.js";
import { ConfirmDeleteAgentCard } from "./confirm/ConfirmDeleteAgentCard.js";
import { ConfirmCreatePipelineCard } from "./confirm/ConfirmCreatePipelineCard.js";
import { ConfirmUpdatePipelineCard } from "./confirm/ConfirmUpdatePipelineCard.js";
import { ConfirmRunPipelineCard } from "./confirm/ConfirmRunPipelineCard.js";
import { ConfirmDeletePipelineCard } from "./confirm/ConfirmDeletePipelineCard.js";
import { ConfirmKillRunCard } from "./confirm/ConfirmKillRunCard.js";
import { ConfirmRetryRunCard } from "./confirm/ConfirmRetryRunCard.js";
import { ConfirmSetBudgetCard } from "./confirm/ConfirmSetBudgetCard.js";
import { ConfirmUpdateMemoryEntityCard } from "./confirm/ConfirmUpdateMemoryEntityCard.js";
import { ConfirmAddLessonCard } from "./confirm/ConfirmAddLessonCard.js";

import { InfoTaskListCard } from "./info/InfoTaskListCard.js";
import { InfoTaskDetailCard } from "./info/InfoTaskDetailCard.js";
import { InfoAgentListCard } from "./info/InfoAgentListCard.js";
import { InfoAgentDetailCard } from "./info/InfoAgentDetailCard.js";
import { InfoRunListCard } from "./info/InfoRunListCard.js";
import { InfoRunDetailCard } from "./info/InfoRunDetailCard.js";
import { InfoCostSummaryCard } from "./info/InfoCostSummaryCard.js";
import { InfoBudgetStatusCard } from "./info/InfoBudgetStatusCard.js";
import { InfoPipelineListCard } from "./info/InfoPipelineListCard.js";
import { InfoPipelineRunHistoryCard } from "./info/InfoPipelineRunHistoryCard.js";
import { InfoMemorySearchCard } from "./info/InfoMemorySearchCard.js";

import { ResultGenericCard } from "./result/ResultGenericCard.js";
import { ResultErrorCard } from "./result/ResultErrorCard.js";

type Registry = {
  [K in ChatCardKind]: ComponentType<CardComponentProps<K>>;
};

const REGISTRY: Registry = {
  // confirm: tasks
  confirm_create_task: ConfirmCreateTaskCard,
  confirm_update_task: ConfirmUpdateTaskCard,
  confirm_assign_task: ConfirmAssignTaskCard,
  confirm_move_task: ConfirmMoveTaskCard,
  confirm_convert_task: ConfirmConvertTaskCard,
  confirm_kill_task: ConfirmKillTaskCard,
  confirm_delete_task: ConfirmDeleteTaskCard,
  // confirm: agents
  confirm_create_agent: ConfirmCreateAgentCard,
  confirm_update_agent: ConfirmUpdateAgentCard,
  confirm_pause_agent: ConfirmPauseAgentCard,
  confirm_resume_agent: ConfirmResumeAgentCard,
  confirm_delete_agent: ConfirmDeleteAgentCard,
  // confirm: pipelines
  confirm_create_pipeline: ConfirmCreatePipelineCard,
  confirm_update_pipeline: ConfirmUpdatePipelineCard,
  confirm_run_pipeline: ConfirmRunPipelineCard,
  confirm_delete_pipeline: ConfirmDeletePipelineCard,
  // confirm: runs
  confirm_kill_run: ConfirmKillRunCard,
  confirm_retry_run: ConfirmRetryRunCard,
  // confirm: budget / memory
  confirm_set_budget: ConfirmSetBudgetCard,
  confirm_update_memory_entity: ConfirmUpdateMemoryEntityCard,
  confirm_add_lesson: ConfirmAddLessonCard,
  // info
  info_task_list: InfoTaskListCard,
  info_task_detail: InfoTaskDetailCard,
  info_agent_list: InfoAgentListCard,
  info_agent_detail: InfoAgentDetailCard,
  info_run_list: InfoRunListCard,
  info_run_detail: InfoRunDetailCard,
  info_cost_summary: InfoCostSummaryCard,
  info_budget_status: InfoBudgetStatusCard,
  info_pipeline_list: InfoPipelineListCard,
  info_pipeline_run_history: InfoPipelineRunHistoryCard,
  info_memory_search: InfoMemorySearchCard,
  // result success — all share ResultGenericCard
  result_create_task: ResultGenericCard as ComponentType<CardComponentProps<"result_create_task">>,
  result_update_task: ResultGenericCard as ComponentType<CardComponentProps<"result_update_task">>,
  result_delete_task: ResultGenericCard as ComponentType<CardComponentProps<"result_delete_task">>,
  result_create_agent: ResultGenericCard as ComponentType<CardComponentProps<"result_create_agent">>,
  result_update_agent: ResultGenericCard as ComponentType<CardComponentProps<"result_update_agent">>,
  result_pause_agent: ResultGenericCard as ComponentType<CardComponentProps<"result_pause_agent">>,
  result_resume_agent: ResultGenericCard as ComponentType<CardComponentProps<"result_resume_agent">>,
  result_delete_agent: ResultGenericCard as ComponentType<CardComponentProps<"result_delete_agent">>,
  result_create_pipeline: ResultGenericCard as ComponentType<CardComponentProps<"result_create_pipeline">>,
  result_update_pipeline: ResultGenericCard as ComponentType<CardComponentProps<"result_update_pipeline">>,
  result_run_pipeline: ResultGenericCard as ComponentType<CardComponentProps<"result_run_pipeline">>,
  result_delete_pipeline: ResultGenericCard as ComponentType<CardComponentProps<"result_delete_pipeline">>,
  result_kill_run: ResultGenericCard as ComponentType<CardComponentProps<"result_kill_run">>,
  result_retry_run: ResultGenericCard as ComponentType<CardComponentProps<"result_retry_run">>,
  result_set_budget: ResultGenericCard as ComponentType<CardComponentProps<"result_set_budget">>,
  result_add_lesson: ResultGenericCard as ComponentType<CardComponentProps<"result_add_lesson">>,
  result_update_memory_entity: ResultGenericCard as ComponentType<CardComponentProps<"result_update_memory_entity">>,
  // result error
  result_error: ResultErrorCard,
};

interface CardRegistryProps {
  extracted: ExtractedCard;
  chatId: string;
  projectId: string;
}

export function CardRegistry({ extracted, chatId, projectId }: CardRegistryProps) {
  const parsed = parseStrictCard({
    kind: extracted.kind,
    summary: extracted.summary,
    payload: extracted.payload,
  });

  if (!parsed.ok) {
    // Render an error fallback. The user sees the failure inline; the
    // raw payload is exposed in the rawResponse field for debugging.
    const fallback: ExtractedCard = {
      ...extracted,
      kind: "result_error",
      payload: {
        reason: "Card payload failed validation",
        rawResponse: JSON.stringify(
          { kind: extracted.kind, payload: extracted.payload, issues: parsed.issues },
          null,
          2,
        ),
      },
    };
    return (
      <ResultErrorCard
        card={{
          kind: "result_error",
          summary: extracted.summary || "Invalid card",
          payload: fallback.payload as { reason: string; httpStatus?: number; endpoint?: string; rawResponse?: string },
        }}
        extracted={fallback}
        chatId={chatId}
        projectId={projectId}
      />
    );
  }

  const Component = REGISTRY[parsed.card.kind] as ComponentType<CardComponentProps<typeof parsed.card.kind>>;
  return (
    <Component
      card={parsed.card as Extract<typeof parsed.card, { kind: typeof parsed.card.kind }>}
      extracted={extracted}
      chatId={chatId}
      projectId={projectId}
    />
  );
}
