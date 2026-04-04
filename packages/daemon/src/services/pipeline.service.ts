import { eq, and, asc } from "drizzle-orm";
import { pipelines, pipelineSteps, tasks } from "@orch/shared/db";
import type { SchemaDb } from "../db/client.js";
import type { PipelineTemplateService } from "./pipeline-template.service.js";
import type { CreatePipeline, PipelineFilter, UpdatePipelineStep } from "@orch/shared";

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

export class PipelineService {
  constructor(
    private db: SchemaDb,
    private templateService: PipelineTemplateService,
  ) {}

  async create(input: CreatePipeline): Promise<CreateResult> {
    let stepDefs: Array<{ label: string; agentId?: string; promptOverride?: string }>;

    if (input.steps && input.steps.length > 0) {
      stepDefs = input.steps;
    } else if (input.templateId) {
      const tpl = await this.templateService.getById(input.templateId);
      if (!tpl) throw new Error("Pipeline template not found");
      stepDefs = (tpl.steps as Array<{ label: string; defaultAgentId?: string; promptTemplate?: string; order: number }>)
        .sort((a, b) => a.order - b.order)
        .map(s => ({
          label: s.label,
          agentId: s.defaultAgentId,
          promptOverride: s.promptTemplate,
        }));
    } else {
      throw new Error("Either steps or templateId must be provided");
    }

    const [pipeline] = await this.db.insert(pipelines).values({
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
      const [step] = await this.db.insert(pipelineSteps).values({
        pipelineId: pipeline.id,
        order: i + 1,
        label: def.label,
        agentId: def.agentId,
        promptOverride: def.promptOverride,
        outputFilePath: `.orch8/pipelines/${pipeline.id}/${def.label}.md`,
        status: "pending",
      }).returning();
      stepRows.push(step);
    }

    const firstStep = stepRows[0];
    const firstTask = await this.createTaskForStep(input.projectId, pipeline, firstStep);

    const [updatedFirstStep] = await this.db
      .update(pipelineSteps)
      .set({ taskId: firstTask.id, updatedAt: new Date() })
      .where(eq(pipelineSteps.id, firstStep.id))
      .returning();
    stepRows[0] = updatedFirstStep;

    return { pipeline, steps: stepRows, firstTask };
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
    pipelineId: string,
    stepId: string,
    summary: string,
    outputFilePath: string,
  ): Promise<CompleteStepResult> {
    // Idempotency guard: if step is already completed, return existing state
    const [existingStep] = await this.db.select().from(pipelineSteps)
      .where(eq(pipelineSteps.id, stepId));
    if (existingStep?.status === "completed") {
      const pipeline = await this.getById(pipelineId);
      if (!pipeline) throw new Error("Pipeline not found");
      return { pipeline, completedStep: existingStep, nextStep: null, nextTask: null };
    }

    const [completedStep] = await this.db
      .update(pipelineSteps)
      .set({
        status: "completed",
        outputSummary: summary,
        outputFilePath,
        updatedAt: new Date(),
      })
      .where(eq(pipelineSteps.id, stepId))
      .returning();

    const allSteps = await this.db.select().from(pipelineSteps)
      .where(eq(pipelineSteps.pipelineId, pipelineId))
      .orderBy(asc(pipelineSteps.order));

    const nextStep = allSteps.find(
      s => s.order > completedStep.order && s.status !== "skipped",
    );

    if (!nextStep) {
      const [updatedPipeline] = await this.db
        .update(pipelines)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(pipelines.id, pipelineId))
        .returning();

      return { pipeline: updatedPipeline, completedStep, nextStep: null, nextTask: null };
    }

    const [updatedPipeline] = await this.db
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
    );

    const [updatedNextStep] = await this.db
      .update(pipelineSteps)
      .set({ taskId: nextTask.id, updatedAt: new Date() })
      .where(eq(pipelineSteps.id, nextStep.id))
      .returning();

    return {
      pipeline: updatedPipeline,
      completedStep,
      nextStep: updatedNextStep,
      nextTask,
    };
  }

  async failStep(pipelineId: string, stepId: string): Promise<FailStepResult> {
    const [step] = await this.db
      .update(pipelineSteps)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(pipelineSteps.id, stepId))
      .returning();

    const [pipeline] = await this.db
      .update(pipelines)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(pipelines.id, pipelineId))
      .returning();

    return { pipeline, step };
  }

  async cancel(pipelineId: string): Promise<Pipeline> {
    const [updated] = await this.db
      .update(pipelines)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(pipelines.id, pipelineId))
      .returning();
    if (!updated) throw new Error("Pipeline not found");
    return updated;
  }

  async retry(pipelineId: string): Promise<CompleteStepResult> {
    const data = await this.getWithSteps(pipelineId);
    if (!data) throw new Error("Pipeline not found");

    const failedStep = data.steps.find(s => s.status === "failed");
    if (!failedStep) throw new Error("No failed step to retry");

    const [resetStep] = await this.db
      .update(pipelineSteps)
      .set({ status: "pending", taskId: null, updatedAt: new Date() })
      .where(eq(pipelineSteps.id, failedStep.id))
      .returning();

    const newTask = await this.createTaskForStep(
      data.pipeline.projectId,
      data.pipeline,
      resetStep,
    );

    const [updatedStep] = await this.db
      .update(pipelineSteps)
      .set({ taskId: newTask.id, updatedAt: new Date() })
      .where(eq(pipelineSteps.id, failedStep.id))
      .returning();

    const [updatedPipeline] = await this.db
      .update(pipelines)
      .set({ status: "running", currentStep: failedStep.order, updatedAt: new Date() })
      .where(eq(pipelines.id, pipelineId))
      .returning();

    return {
      pipeline: updatedPipeline,
      completedStep: updatedStep,
      nextStep: updatedStep,
      nextTask: newTask,
    };
  }

  async rejectStep(
    pipelineId: string,
    rejectingStepId: string,
    targetStepId: string,
    feedback: string,
  ): Promise<RejectStepResult> {
    const data = await this.getWithSteps(pipelineId);
    if (!data) throw new Error("Pipeline not found");

    const rejectingStep = data.steps.find(s => s.id === rejectingStepId);
    if (!rejectingStep) throw new Error("Rejecting step not found");

    const targetStep = data.steps.find(s => s.id === targetStepId);
    if (!targetStep) throw new Error("Target step not found");

    if (targetStep.order >= rejectingStep.order) {
      throw new Error("Target step must have a lower order than the rejecting step");
    }

    // 1. Mark rejecting step as failed with rejection feedback
    const [updatedRejectingStep] = await this.db
      .update(pipelineSteps)
      .set({
        status: "failed",
        outputSummary: `[REJECTED] ${feedback}`,
        updatedAt: new Date(),
      })
      .where(eq(pipelineSteps.id, rejectingStepId))
      .returning();

    // 2. Reset intermediate steps (target.order <= order < rejecting.order) to pending
    for (const step of data.steps) {
      if (step.order >= targetStep.order && step.order < rejectingStep.order) {
        await this.db
          .update(pipelineSteps)
          .set({ status: "pending", taskId: null, updatedAt: new Date() })
          .where(eq(pipelineSteps.id, step.id));
      }
    }

    // 3. Update pipeline status and currentStep
    const [updatedPipeline] = await this.db
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
    const [newTask] = await this.db.insert(tasks).values({
      projectId: updatedPipeline.projectId,
      title: `[${updatedPipeline.name}] ${targetStep.label}`,
      description: taskDescription,
      taskType: "quick",
      assignee: targetStep.agentId,
      pipelineId: updatedPipeline.id,
      pipelineStepId: targetStep.id,
    }).returning();

    // 6. Link task to target step
    const [updatedTargetStep] = await this.db
      .update(pipelineSteps)
      .set({ taskId: newTask.id, status: "pending", updatedAt: new Date() })
      .where(eq(pipelineSteps.id, targetStepId))
      .returning();

    return {
      pipeline: updatedPipeline,
      rejectedStep: updatedRejectingStep,
      targetStep: updatedTargetStep,
      newTask,
    };
  }

  async updateStep(pipelineId: string, stepId: string, input: UpdatePipelineStep): Promise<PipelineStep> {
    const [step] = await this.db.select().from(pipelineSteps)
      .where(and(eq(pipelineSteps.id, stepId), eq(pipelineSteps.pipelineId, pipelineId)));
    if (!step) throw new Error("Pipeline step not found");
    if (step.status === "completed") throw new Error("Cannot modify completed step");

    const [updated] = await this.db
      .update(pipelineSteps)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(pipelineSteps.id, stepId))
      .returning();

    return updated;
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
  ): Promise<Task> {
    const [task] = await this.db.insert(tasks).values({
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
