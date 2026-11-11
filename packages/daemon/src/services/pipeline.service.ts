import { eq, and, asc } from "drizzle-orm";
import { pipelines, pipelineSteps, tasks, projects } from "@orch/shared/db";
import type { BroadcastService } from "./broadcast.service.js";
import type { SchemaDb } from "../db/client.js";
import type { PipelineTemplateService } from "./pipeline-template.service.js";
import type { CreatePipeline, PipelineFilter, UpdatePipelineStep } from "@orch/shared";
import { allocateTaskId } from "./task.service.js";
import { withRepositoryWriter } from "./repository-checkout-gate.js";

type Pipeline = typeof pipelines.$inferSelect;
type PipelineStep = typeof pipelineSteps.$inferSelect;
type Task = typeof tasks.$inferSelect;

interface CreateResult {
  pipeline: Pipeline;
  steps: PipelineStep[];
  firstTask: Task;
}

interface CompleteStepResult {
  pipeline: Pipeline;
  completedStep: PipelineStep;
  nextStep: PipelineStep | null;
  nextTask: Task | null;
}

interface FailStepResult {
  pipeline: Pipeline;
  step: PipelineStep;
}

interface RejectStepResult {
  pipeline: Pipeline;
  rejectedStep: PipelineStep;
  targetStep: PipelineStep;
  newTask: Task;
}

interface ApproveStepResult {
  pipeline: Pipeline;
  approvedStep: PipelineStep;
  nextStep: PipelineStep | null;
  nextTask: Task | null;
}


export type PipelineTx = Parameters<Parameters<SchemaDb["transaction"]>[0]>[0];
export class PipelineConflict extends Error {
  readonly statusCode = 409;
}

export async function lockPipeline(tx: PipelineTx, pipelineId: string) {
  const [hint] = await tx.select().from(pipelines).where(eq(pipelines.id, pipelineId));
  if (!hint) return undefined;
  // Match ordinary task creation: allocator before pipeline, steps and task.
  // NO KEY UPDATE serializes allocation without blocking foreign-key readers.
  await tx.select().from(projects).where(eq(projects.id, hint.projectId)).for("no key update");
  const [pipeline] = await tx.select().from(pipelines).where(eq(pipelines.id, pipelineId)).for("update");
  return pipeline;
}

export async function lockPipelineAttempt(tx: PipelineTx, pipelineId: string, stepId: string, taskId: string) {
  const pipeline = await lockPipeline(tx, pipelineId);
  if (!pipeline) throw new PipelineConflict("Pipeline not found for task");
  const steps = await tx.select().from(pipelineSteps).where(eq(pipelineSteps.pipelineId, pipelineId))
    .orderBy(asc(pipelineSteps.order)).for("update");
  const step = steps.find(s => s.id === stepId);
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
  if (!step || !task || task.projectId !== pipeline.projectId || task.pipelineId !== pipelineId ||
      task.pipelineStepId !== stepId || step.taskId !== taskId) {
    throw new PipelineConflict("Stale or inconsistent pipeline task attempt");
  }
  return { pipeline, steps, step, task };
}

export function requireActiveAttempt(pipeline: Pipeline, step: PipelineStep, task: Task) {
  if (!["pending", "running"].includes(pipeline.status) || pipeline.currentStep !== step.order ||
      !["pending", "running"].includes(step.status) || task.column === "done") {
    throw new PipelineConflict("Pipeline task attempt is not active");
  }
}

export class PipelineService {
  constructor(
    private db: SchemaDb,
    private templateService: PipelineTemplateService,
    private broadcastService?: BroadcastService,
  ) {}

  async create(input: CreatePipeline): Promise<CreateResult> {
    return withRepositoryWriter(this.db, input.projectId, () => this.createInRepository(input));
  }

  private async createInRepository(input: CreatePipeline): Promise<CreateResult> {
    let stepDefs: Array<{ label: string; agentId?: string; promptOverride?: string; requiresVerification?: boolean }>;

    if (input.steps && input.steps.length > 0) {
      stepDefs = input.steps;
    } else if (input.templateId) {
      const tpl = await this.templateService.getById(input.templateId);
      if (!tpl) throw new Error("Pipeline template not found");
      stepDefs = (tpl.steps as Array<{ label: string; defaultAgentId?: string; promptTemplate?: string; order: number; requiresVerification?: boolean }>)
        .sort((a, b) => a.order - b.order)
        .map(s => ({
          label: s.label,
          agentId: s.defaultAgentId,
          promptOverride: s.promptTemplate,
          requiresVerification: s.requiresVerification,
        }));
    } else {
      throw new Error("Either steps or templateId must be provided");
    }

    // Create the pipeline, all step rows, the first task, and the first
    // step's taskId backlink atomically — a crash mid-sequence would otherwise
    // leave a pipeline without steps or a step pointing at a nonexistent task.
    return this.db.transaction(async (tx) => {
      const [pipeline] = await tx.insert(pipelines).values({
        projectId: input.projectId,
        name: input.name,
        templateId: input.templateId,
        status: "pending",
        currentStep: 1,
        createdBy: input.createdBy ?? "user",
      }).returning();

      const stepRows: PipelineStep[] = [];
      for (let i = 0; i < stepDefs.length; i++) {
        const def = stepDefs[i];
        const [step] = await tx.insert(pipelineSteps).values({
          pipelineId: pipeline.id,
          order: i + 1,
          label: def.label,
          agentId: def.agentId,
          promptOverride: def.promptOverride,
          requiresVerification: def.requiresVerification ?? false,
          outputFilePath: `.orch8/pipelines/${pipeline.id}/${def.label}.md`,
          status: "pending",
        }).returning();
        stepRows.push(step);
      }

      const firstStep = stepRows[0];
      const [firstTask] = await tx.insert(tasks).values({
        id: await allocateTaskId(tx, input.projectId),
        projectId: input.projectId,
        title: `[${pipeline.name}] ${firstStep.label}`,
        description: firstStep.promptOverride ?? `Pipeline step: ${firstStep.label}`,
        taskType: "quick",
        assignee: firstStep.agentId,
        pipelineId: pipeline.id,
        pipelineStepId: firstStep.id,
      }).returning();

      const [updatedFirstStep] = await tx
        .update(pipelineSteps)
        .set({ taskId: firstTask.id, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, firstStep.id))
        .returning();
      stepRows[0] = updatedFirstStep;

      return { pipeline, steps: stepRows, firstTask };
    });
  }

  async list(filter: PipelineFilter): Promise<Pipeline[]> {
    const conditions = [];
    if (filter.projectId) conditions.push(eq(pipelines.projectId, filter.projectId));
    if (filter.status) conditions.push(eq(pipelines.status, filter.status));

    if (conditions.length === 0) {
      return this.db.select().from(pipelines);
    }
    return this.db.select().from(pipelines).where(and(...conditions));
  }

  async getById(id: string): Promise<Pipeline | null> {
    const result = await this.db.select().from(pipelines).where(eq(pipelines.id, id));
    return result[0] ?? null;
  }

  async getWithSteps(id: string): Promise<{ pipeline: Pipeline; steps: PipelineStep[] } | null> {
    const pipeline = await this.getById(id);
    if (!pipeline) return null;

    const steps = await this.db.select().from(pipelineSteps)
      .where(eq(pipelineSteps.pipelineId, id))
      .orderBy(asc(pipelineSteps.order));

    return { pipeline, steps };
  }

  async completeStep(
    pipelineId: string, stepId: string, taskId: string,
    summary: string, outputFilePath?: string,
  ): Promise<CompleteStepResult> {
    let transition: { taskId: string; from: string; to: string } | undefined;
    const result = await this.db.transaction(async (tx) => {
      const { pipeline, steps, step, task } = await lockPipelineAttempt(tx, pipelineId, stepId, taskId);
      if (pipeline.status === "cancelled") throw new PipelineConflict("Pipeline is not active");
      if (step.status === "completed" || step.status === "awaiting_verification") {
        return { pipeline, completedStep: step, nextStep: null, nextTask: null };
      }
      requireActiveAttempt(pipeline, step, task);
      transition = { taskId, from: task.column, to: "done" };
      await tx.update(tasks).set({ column: "done", executionRunId: null,
        executionAgentId: null, executionLockedAt: null, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
      const [completedStep] = await tx.update(pipelineSteps).set({
        status: step.requiresVerification ? "awaiting_verification" : "completed",
        outputSummary: summary,
        outputFilePath: outputFilePath ?? step.outputFilePath ?? `.orch8/pipelines/${pipelineId}/${step.label}.md`,
        updatedAt: new Date(),
      }).where(eq(pipelineSteps.id, stepId)).returning();
      const nextStep = step.requiresVerification ? undefined : steps.find(s => s.order > step.order && s.status !== "skipped");
      const [updatedPipeline] = await tx.update(pipelines).set({
        status: step.requiresVerification || nextStep ? "running" : "completed",
        currentStep: nextStep?.order ?? pipeline.currentStep, updatedAt: new Date(),
      }).where(eq(pipelines.id, pipelineId)).returning();
      if (!nextStep) return { pipeline: updatedPipeline, completedStep, nextStep: null, nextTask: null };
      const nextTask = await this.createTaskForStep(pipeline.projectId, updatedPipeline, nextStep, tx);
      // A rejected review keeps its failed state while implementation is reworked.
      // On return, replace that decision with a fresh review task and output.
      const [updatedNextStep] = await tx.update(pipelineSteps).set({
        taskId: nextTask.id, status: "pending", outputSummary: null,
        outputFilePath: nextStep.status === "failed"
          ? `.orch8/pipelines/${pipelineId}/${nextStep.label}-${nextTask.id}.md` : null,
        updatedAt: new Date(),
      }).where(eq(pipelineSteps.id, nextStep.id)).returning();
      return { pipeline: updatedPipeline, completedStep, nextStep: updatedNextStep, nextTask };
    });
    if (transition) this.broadcastService?.taskTransitioned(result.pipeline.projectId, transition);
    return result;
  }

  async approveStep(pipelineId: string, stepId: string, approvedRevision?: { branch: string; commit: string }): Promise<ApproveStepResult> {
    return this.db.transaction(async (tx) => {
      // Serialize decisions before reading state, including competing rejection.
      const pipeline = await lockPipeline(tx, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      if (pipeline.status !== "pending" && pipeline.status !== "running") {
        throw new PipelineConflict("Pipeline is not active");
      }

      const [step] = await tx.select().from(pipelineSteps)
        .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)))
        .for("update");
      if (!step) throw new Error("Pipeline step not found");
      if (step.status !== "awaiting_verification") {
        throw new PipelineConflict("Step is not awaiting verification");
      }

      if (step.order !== pipeline.currentStep) throw new PipelineConflict("Step is not current");
      await lockPipelineAttempt(tx, pipelineId, stepId, step.taskId ?? "");

      const [approvedStep] = await tx
        .update(pipelineSteps)
        .set({ status: "completed", updatedAt: new Date(),
          ...(["review", "independent review"].includes(step.label.toLowerCase()) && step.requiresVerification && approvedRevision
            ? { approvedBranch: approvedRevision.branch, approvedCommit: approvedRevision.commit } : {}),
        })
        .where(eq(pipelineSteps.id, stepId))
        .returning();

      const allSteps = await tx.select().from(pipelineSteps)
        .where(eq(pipelineSteps.pipelineId, pipelineId))
        .orderBy(asc(pipelineSteps.order));

      const nextStep = allSteps.find(
        s => s.order > approvedStep.order && s.status !== "skipped",
      );

      if (!nextStep) {
        const [updatedPipeline] = await tx
          .update(pipelines)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(pipelines.id, pipelineId))
          .returning();

        return { pipeline: updatedPipeline, approvedStep, nextStep: null, nextTask: null };
      }

      const [updatedPipeline] = await tx
        .update(pipelines)
        .set({
          status: "running",
          currentStep: nextStep.order,
          updatedAt: new Date(),
        })
        .where(eq(pipelines.id, pipelineId))
        .returning();

      const nextTask = await this.createTaskForStep(
        updatedPipeline.projectId,
        updatedPipeline,
        nextStep,
        tx,
      );

      const [updatedNextStep] = await tx
        .update(pipelineSteps)
        .set({ taskId: nextTask.id, status: "pending", outputSummary: null,
          outputFilePath: nextStep.status === "failed"
            ? `.orch8/pipelines/${pipelineId}/${nextStep.label}-${nextTask.id}.md` : null,
          updatedAt: new Date() })
        .where(eq(pipelineSteps.id, nextStep.id))
        .returning();

      return {
        pipeline: updatedPipeline,
        approvedStep,
        nextStep: updatedNextStep,
        nextTask,
      };
    });
  }

  async failStep(pipelineId: string, stepId: string, taskId: string): Promise<FailStepResult> {
    return this.db.transaction(async tx => {
      const state = await lockPipelineAttempt(tx, pipelineId, stepId, taskId);
      requireActiveAttempt(state.pipeline, state.step, state.task);
      const [step] = await tx.update(pipelineSteps).set({ status: "failed", updatedAt: new Date() })
        .where(eq(pipelineSteps.id, stepId)).returning();
      const [pipeline] = await tx.update(pipelines).set({ status: "failed", updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId)).returning();
      return { pipeline, step };
    });
  }

  async cancel(pipelineId: string): Promise<Pipeline> {
    return this.db.transaction(async tx => {
      const pipeline = await lockPipeline(tx, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      const [updated] = await tx.update(pipelines).set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId)).returning();
      return updated;
    });
  }

  async retry(pipelineId: string): Promise<CompleteStepResult> {
    return this.db.transaction(async tx => {
      const pipeline = await lockPipeline(tx, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      if (pipeline.status !== "failed") throw new PipelineConflict("Pipeline is not failed");
      const steps = await tx.select().from(pipelineSteps).where(eq(pipelineSteps.pipelineId, pipelineId))
        .orderBy(asc(pipelineSteps.order)).for("update");
      const failedStep = steps.find(s => s.status === "failed" && s.order === pipeline.currentStep);
      if (!failedStep) throw new PipelineConflict("No failed step to retry");
      await lockPipelineAttempt(tx, pipelineId, failedStep.id, failedStep.taskId ?? "");
      const [resetStep] = await tx.update(pipelineSteps).set({ status: "pending", taskId: null,
        outputSummary: null, outputFilePath: null, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, failedStep.id)).returning();
      const newTask = await this.createTaskForStep(pipeline.projectId, pipeline, resetStep, tx);
      const [updatedStep] = await tx.update(pipelineSteps).set({ taskId: newTask.id,
        outputFilePath: failedStep.order === 1 && failedStep.label.toLowerCase() === "plan"
          ? `.orch8/pipelines/${pipelineId}/Plan-${newTask.id}.md` : null,
        updatedAt: new Date() })
        .where(eq(pipelineSteps.id, failedStep.id)).returning();
      const [updatedPipeline] = await tx.update(pipelines).set({ status: "running", updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId)).returning();
      return { pipeline: updatedPipeline, completedStep: updatedStep, nextStep: updatedStep, nextTask: newTask };
    });
  }

  // A plan revision has its own task and filename; the first attempt writes Plan.md.
  async getPlanAttempts(pipelineId: string): Promise<Array<{ taskId: string; path: string }>> {
    const result = await this.getWithSteps(pipelineId);
    if (!result || !/^[\w-]+$/.test(pipelineId)) return [];
    const plan = result.steps.find(step => step.order === 1 && step.label.toLowerCase() === "plan");
    if (!plan) return [];
    const attempts = await this.db.select({ id: tasks.id }).from(tasks).where(and(
      eq(tasks.projectId, result.pipeline.projectId), eq(tasks.pipelineId, pipelineId), eq(tasks.pipelineStepId, plan.id),
    )).orderBy(asc(tasks.createdAt), asc(tasks.id));
    return attempts.filter(task => /^[\w-]+$/.test(task.id)).map((task, index) => ({
      taskId: task.id,
      path: index === 0 ? `.orch8/pipelines/${pipelineId}/${plan.label}.md`
        : `.orch8/pipelines/${pipelineId}/Plan-${task.id}.md`,
    }));
  }

  async getPublicationOutputPaths(pipelineId: string): Promise<string[]> {
    const result = await this.getWithSteps(pipelineId);
    if (!result) return [];
    return [...new Set([
      ...result.steps.flatMap(step => step.outputFilePath ? [step.outputFilePath] : []),
      ...(await this.getPlanAttempts(pipelineId)).map(attempt => attempt.path),
    ])];
  }

  async requestPlanChanges(pipelineId: string, stepId: string, feedback: string) {
    feedback = feedback.trim();
    if (!feedback || feedback.length > 10000) throw new PipelineConflict("Feedback must contain 1 to 10000 characters");
    return this.db.transaction(async tx => {
      const pipeline = await lockPipeline(tx, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      const [candidate] = await tx.select().from(pipelineSteps)
        .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)));
      if (!candidate) throw new PipelineConflict("Plan step not found");
      const { step, task } = await lockPipelineAttempt(tx, pipelineId, stepId, candidate.taskId ?? "");
      if (!["pending", "running"].includes(pipeline.status) || pipeline.currentStep !== step.order ||
          step.order !== 1 || step.label.toLowerCase() !== "plan" || !step.requiresVerification ||
          step.status !== "awaiting_verification") {
        throw new PipelineConflict("Current Plan step is not awaiting verification");
      }
      // Keep the prior task and artifact as audit evidence. Each revision writes a new file.
      const description = `${step.promptOverride ?? `Pipeline step: ${step.label}`}\n\nPlan revision requested. Regenerate the plan only; implementation still requires approval.\n\nPrevious planning task: ${task.id}\nPrevious plan artifact: ${step.outputFilePath ?? "not recorded"}\nPrevious plan summary: ${step.outputSummary ?? ""}\n\nUser feedback:\n${feedback}`;
      const newTask = await this.createTaskForStep(pipeline.projectId, pipeline, { ...step, promptOverride: description }, tx);
      const [updatedStep] = await tx.update(pipelineSteps).set({ status: "pending", taskId: newTask.id,
        outputSummary: null, outputFilePath: `.orch8/pipelines/${pipelineId}/Plan-${newTask.id}.md`, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, stepId)).returning();
      const [updatedPipeline] = await tx.update(pipelines).set({ status: "running", updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId)).returning();
      return { pipeline: updatedPipeline, step: updatedStep, newTask };
    });
  }

  async rejectStep(
    pipelineId: string,
    rejectingStepId: string,
    targetStepId: string,
    feedback: string,
  ): Promise<RejectStepResult> {
    return this.db.transaction(async (tx) => {
      // Use the same pipeline-first lock order as approval.
      const pipeline = await lockPipeline(tx, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      if (pipeline.status !== "pending" && pipeline.status !== "running") {
        throw new PipelineConflict("Pipeline is not active");
      }
      const steps = await tx.select().from(pipelineSteps)
        .where(eq(pipelineSteps.pipelineId, pipelineId))
        .orderBy(asc(pipelineSteps.order)).for("update");
      const rejectingStep = steps.find(s => s.id === rejectingStepId);
      if (!rejectingStep) throw new Error("Rejecting step not found");
      const targetStep = steps.find(s => s.id === targetStepId);
      if (!targetStep) throw new Error("Target step not found");
      if (targetStep.order >= rejectingStep.order) {
        throw new Error("Target step must have a lower order than the rejecting step");
      }
      if (!["pending", "running", "awaiting_verification"].includes(rejectingStep.status)) {
        throw new PipelineConflict("Step cannot be rejected");
      }
      if (rejectingStep.order !== pipeline.currentStep) throw new PipelineConflict("Step is not current");
      await lockPipelineAttempt(tx, pipelineId, rejectingStepId, rejectingStep.taskId ?? "");

      // 1. Mark rejecting step as failed with rejection feedback
      const [updatedRejectingStep] = await tx
        .update(pipelineSteps)
        .set({
          status: "failed",
          outputSummary: `[REJECTED] ${feedback}`,
          updatedAt: new Date(),
        })
        .where(eq(pipelineSteps.id, rejectingStepId))
        .returning();

      // 2. Reset intermediate steps (target.order <= order < rejecting.order) to pending
      for (const step of steps) {
        if (step.order >= targetStep.order && step.order < rejectingStep.order) {
          await tx
            .update(pipelineSteps)
            .set({ status: "pending", taskId: null, outputSummary: null, outputFilePath: null, updatedAt: new Date() })
            .where(eq(pipelineSteps.id, step.id));
        }
      }

      // 3. Update pipeline status and currentStep
      const [updatedPipeline] = await tx
        .update(pipelines)
        .set({
          status: "running",
          currentStep: targetStep.order,
          updatedAt: new Date(),
        })
        .where(eq(pipelines.id, pipelineId))
        .returning();

      // 4. Build task description with rejection feedback
      const originalPrompt = targetStep.promptOverride ?? `Pipeline step: ${targetStep.label}`;
      const taskDescription = `${originalPrompt}\n\n---\n\n**Rejection feedback from ${rejectingStep.label} step:**\n${feedback}`;

      // 5. Create new task for target step
      const [newTask] = await tx.insert(tasks).values({
        id: await allocateTaskId(tx, updatedPipeline.projectId),
        projectId: updatedPipeline.projectId,
        title: `[${updatedPipeline.name}] ${targetStep.label}`,
        description: taskDescription,
        taskType: "quick",
        assignee: targetStep.agentId,
        pipelineId: updatedPipeline.id,
        pipelineStepId: targetStep.id,
      }).returning();

      // 6. Link task to target step
      const [updatedTargetStep] = await tx
        .update(pipelineSteps)
        .set({ taskId: newTask.id, status: "pending",
          outputFilePath: targetStep.order === 1 && targetStep.label.toLowerCase() === "plan"
            ? `.orch8/pipelines/${pipelineId}/Plan-${newTask.id}.md` : null,
          updatedAt: new Date() })
        .where(eq(pipelineSteps.id, targetStepId))
        .returning();

      return {
        pipeline: updatedPipeline,
        rejectedStep: updatedRejectingStep,
        targetStep: updatedTargetStep,
        newTask,
      };
    });
  }

  async updateStep(pipelineId: string, stepId: string, input: UpdatePipelineStep): Promise<PipelineStep> {
    return this.db.transaction(async tx => {
      const pipeline = await lockPipeline(tx, pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      if (!["pending", "running"].includes(pipeline.status)) throw new PipelineConflict("Pipeline is not active");
      const [step] = await tx.select().from(pipelineSteps)
        .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId))).for("update");
      if (!step) throw new Error("Pipeline step not found");
      if (!["pending", "running"].includes(step.status)) throw new PipelineConflict("Cannot modify completed step");
      if (step.taskId) {
        const state = await lockPipelineAttempt(tx, pipelineId, stepId, step.taskId);
        requireActiveAttempt(pipeline, step, state.task);
        if (state.task.executionRunId) throw new PipelineConflict("Cannot modify an executing pipeline step");
        if (input.agentId !== undefined) await tx.update(tasks).set({ assignee: input.agentId, updatedAt: new Date() })
          .where(eq(tasks.id, step.taskId));
      }
      const [updated] = await tx.update(pipelineSteps).set({ ...input, updatedAt: new Date() })
        .where(eq(pipelineSteps.id, stepId)).returning();
      return updated;
    });
  }

  async findByTaskId(taskId: string): Promise<{ pipeline: Pipeline; step: PipelineStep } | null> {
    const [step] = await this.db.select().from(pipelineSteps)
      .where(eq(pipelineSteps.taskId, taskId));
    if (!step) return null;

    const pipeline = await this.getById(step.pipelineId);
    if (!pipeline) return null;

    return { pipeline, step };
  }

  async buildStepContext(pipelineId: string, currentOrder: number): Promise<string> {
    const allSteps = await this.db.select().from(pipelineSteps)
      .where(eq(pipelineSteps.pipelineId, pipelineId))
      .orderBy(asc(pipelineSteps.order));

    const pipeline = await this.getById(pipelineId);
    if (!pipeline) return "";

    const totalSteps = allSteps.length;
    const currentStep = allSteps.find(s => s.order === currentOrder);

    const sections: string[] = [
      `## Pipeline: ${pipeline.name}`,
      `## Current Step: ${currentStep?.label ?? "unknown"} (step ${currentOrder} of ${totalSteps})`,
    ];

    const priorCompleted = allSteps.filter(
      s => s.order < currentOrder && s.status === "completed" && s.outputSummary,
    );

    if (priorCompleted.length > 0) {
      sections.push("## Prior Step Outputs:");
      for (const step of priorCompleted) {
        sections.push(
          `### Step ${step.order}: ${step.label}\n${step.outputSummary}\nFull output: ${step.outputFilePath}`,
        );
      }
    }

    return sections.join("\n\n");
  }

  private async createTaskForStep(
    projectId: string,
    pipeline: Pipeline,
    step: PipelineStep,
    db: PipelineTx,
  ): Promise<Task> {
    const [task] = await db.insert(tasks).values({
      id: await allocateTaskId(db, projectId),
      projectId,
      title: `[${pipeline.name}] ${step.label}`,
      description: step.promptOverride ?? `Pipeline step: ${step.label}`,
      taskType: "quick",
      assignee: step.agentId,
      pipelineId: pipeline.id,
      pipelineStepId: step.id,
    }).returning();
    return task;
  }
}
