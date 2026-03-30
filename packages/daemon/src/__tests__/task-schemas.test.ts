import { describe, it, expect } from "vitest";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  CompletePhaseSchema,
  ConvertTaskSchema,
  TaskFilterSchema,
} from "@orch/shared";

describe("Task Zod Schemas", () => {
  describe("CreateTaskSchema", () => {
    it("validates a quick task", () => {
      const result = CreateTaskSchema.safeParse({
        title: "Fix bug",
        projectId: "proj_123",
        taskType: "quick",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.taskType).toBe("quick");
      }
    });

    it("validates a complex task with phase agent overrides", () => {
      const result = CreateTaskSchema.safeParse({
        title: "New auth",
        projectId: "proj_123",
        taskType: "complex",
        researchAgentId: "researcher",
        implementAgentId: "implementer",
      });
      expect(result.success).toBe(true);
    });

    it("validates a brainstorm task", () => {
      const result = CreateTaskSchema.safeParse({
        title: "Explore options",
        projectId: "proj_123",
        taskType: "brainstorm",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing title", () => {
      const result = CreateTaskSchema.safeParse({
        projectId: "proj_123",
        taskType: "quick",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid task type", () => {
      const result = CreateTaskSchema.safeParse({
        title: "Test",
        projectId: "proj_123",
        taskType: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("applies default priority", () => {
      const result = CreateTaskSchema.parse({
        title: "Test",
        projectId: "proj_123",
        taskType: "quick",
      });
      expect(result.priority).toBe("medium");
    });
  });

  describe("UpdateTaskSchema", () => {
    it("validates partial updates", () => {
      const result = UpdateTaskSchema.safeParse({ title: "New title" });
      expect(result.success).toBe(true);
    });

    it("validates column change", () => {
      const result = UpdateTaskSchema.safeParse({ column: "in_progress" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid column", () => {
      const result = UpdateTaskSchema.safeParse({ column: "invalid" });
      expect(result.success).toBe(false);
    });

    it("allows nullable assignee", () => {
      const result = UpdateTaskSchema.safeParse({ assignee: null });
      expect(result.success).toBe(true);
    });
  });

  describe("CompletePhaseSchema", () => {
    it("requires output", () => {
      const result = CompletePhaseSchema.safeParse({ output: "Research findings..." });
      expect(result.success).toBe(true);
    });

    it("rejects empty output", () => {
      const result = CompletePhaseSchema.safeParse({ output: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("ConvertTaskSchema", () => {
    it("allows converting to quick", () => {
      const result = ConvertTaskSchema.safeParse({ taskType: "quick" });
      expect(result.success).toBe(true);
    });

    it("allows converting to complex", () => {
      const result = ConvertTaskSchema.safeParse({ taskType: "complex" });
      expect(result.success).toBe(true);
    });

    it("rejects converting to brainstorm", () => {
      const result = ConvertTaskSchema.safeParse({ taskType: "brainstorm" });
      expect(result.success).toBe(false);
    });
  });

  describe("TaskFilterSchema", () => {
    it("validates empty filter", () => {
      const result = TaskFilterSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("validates full filter", () => {
      const result = TaskFilterSchema.safeParse({
        projectId: "proj_123",
        column: "backlog",
        taskType: "complex",
        assignee: "fe-eng",
        complexPhase: "implement",
      });
      expect(result.success).toBe(true);
    });
  });
});
