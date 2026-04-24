import { describe, expect, it } from "vitest";
import { resolveWakeTargets } from "../services/wake-targets.js";

describe("resolveWakeTargets", () => {
  it("returns no targets when notify is disabled with mentions", () => {
    expect(resolveWakeTargets({
      authorAgentId: "author",
      mentionedAgentIds: ["alice"],
      taskAssigneeAgentId: "bob",
      notifyEnabled: false,
    })).toEqual([]);
  });

  it("returns no targets when notify is disabled without mentions", () => {
    expect(resolveWakeTargets({
      authorAgentId: "author",
      mentionedAgentIds: [],
      taskAssigneeAgentId: "bob",
      notifyEnabled: false,
    })).toEqual([]);
  });

  it("uses mentions before assignment", () => {
    expect(resolveWakeTargets({
      authorAgentId: "author",
      mentionedAgentIds: ["alice"],
      taskAssigneeAgentId: "bob",
      notifyEnabled: true,
    })).toEqual([{ agentId: "alice", reason: "mention" }]);
  });

  it("filters and dedupes author self-mentions", () => {
    expect(resolveWakeTargets({
      authorAgentId: "alice",
      mentionedAgentIds: ["alice", "bob", "bob"],
      taskAssigneeAgentId: "carol",
      notifyEnabled: true,
    })).toEqual([{ agentId: "bob", reason: "mention" }]);
  });

  it("does not fall back to assignment when all mentions are self-mentions", () => {
    expect(resolveWakeTargets({
      authorAgentId: "alice",
      mentionedAgentIds: ["alice"],
      taskAssigneeAgentId: "bob",
      notifyEnabled: true,
    })).toEqual([]);
  });

  it("falls back to assignment without mentions", () => {
    expect(resolveWakeTargets({
      authorAgentId: "author",
      mentionedAgentIds: [],
      taskAssigneeAgentId: "bob",
      notifyEnabled: true,
    })).toEqual([{ agentId: "bob", reason: "assignment" }]);
  });

  it("skips assignment when the assignee is the author", () => {
    expect(resolveWakeTargets({
      authorAgentId: "bob",
      mentionedAgentIds: [],
      taskAssigneeAgentId: "bob",
      notifyEnabled: true,
    })).toEqual([]);
  });

  it("skips assignment when there is no assignee", () => {
    expect(resolveWakeTargets({
      authorAgentId: null,
      mentionedAgentIds: [],
      taskAssigneeAgentId: null,
      notifyEnabled: true,
    })).toEqual([]);
  });
});
