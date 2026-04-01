import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  getValidTargets,
  VALID_TRANSITIONS,
  type TaskColumn,
} from "../services/task-transitions.js";

describe("task-transitions", () => {
  describe("VALID_TRANSITIONS", () => {
    it("defines transitions for all columns", () => {
      const columns: TaskColumn[] = [
        "backlog", "blocked", "in_progress", "done",
      ];
      for (const col of columns) {
        expect(VALID_TRANSITIONS).toHaveProperty(col);
      }
    });

    it("done has no outgoing transitions", () => {
      expect(VALID_TRANSITIONS.done).toEqual([]);
    });
  });

  describe("isValidTransition", () => {
    it.each([
      ["backlog", "blocked"],
      ["backlog", "in_progress"],
      ["blocked", "backlog"],
      ["blocked", "in_progress"],
      ["in_progress", "done"],
    ] as [TaskColumn, TaskColumn][])("allows %s → %s", (from, to) => {
      expect(isValidTransition(from, to)).toBe(true);
    });

    it.each([
      ["backlog", "done"],
      ["in_progress", "backlog"],
      ["in_progress", "blocked"],
      ["done", "backlog"],
      ["done", "in_progress"],
    ] as [TaskColumn, TaskColumn][])("rejects %s → %s", (from, to) => {
      expect(isValidTransition(from, to)).toBe(false);
    });

    it("rejects same-state transitions", () => {
      expect(isValidTransition("backlog", "backlog")).toBe(false);
    });
  });

  describe("getValidTargets", () => {
    it("returns valid targets for backlog", () => {
      expect(getValidTargets("backlog")).toEqual(["blocked", "in_progress"]);
    });

    it("returns empty array for done", () => {
      expect(getValidTargets("done")).toEqual([]);
    });
  });
});
