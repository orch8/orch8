import { describe, it, expect } from "vitest";
import { extractCards, FENCE_OPEN, FENCE_CLOSE } from "../services/chat-card-parser.js";

describe("extractCards", () => {
  it("returns [] when no fences present", () => {
    const result = extractCards("Hello world, no cards here.");
    expect(result.cards).toEqual([]);
    expect(result.textOnly).toBe("Hello world, no cards here.");
  });

  it("extracts a single well-formed card", () => {
    const text = [
      "Here is what I propose:",
      "```orch8-card",
      JSON.stringify({
        kind: "confirm_create_agent",
        summary: "Create QA bot",
        payload: { name: "qa-bot", model: "claude-sonnet-4-6" },
      }),
      "```",
      "Click Approve to continue.",
    ].join("\n");

    const result = extractCards(text);
    expect(result.cards).toHaveLength(1);
    const card = result.cards[0];
    expect(card.kind).toBe("confirm_create_agent");
    expect(card.summary).toBe("Create QA bot");
    expect(card.payload).toEqual({ name: "qa-bot", model: "claude-sonnet-4-6" });
    expect(card.status).toBe("pending");
    expect(card.id).toMatch(/^card_/);
  });

  it("extracts multiple cards in order", () => {
    const text = [
      "```orch8-card",
      '{"kind":"info_task_list","summary":"3 tasks","payload":{"count":3}}',
      "```",
      "And another:",
      "```orch8-card",
      '{"kind":"confirm_create_task","summary":"Create T","payload":{"title":"T"}}',
      "```",
    ].join("\n");

    const result = extractCards(text);
    expect(result.cards.map((c) => c.kind)).toEqual([
      "info_task_list",
      "confirm_create_task",
    ]);
  });

  it("ignores fences with invalid JSON and records an error card", () => {
    const text = [
      "```orch8-card",
      "{not valid json",
      "```",
    ].join("\n");

    const result = extractCards(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].kind).toBe("result_error");
    expect(result.cards[0].status).toBe("error");
    expect((result.cards[0].payload as { reason: string }).reason).toContain("parse");
  });

  it("ignores fences missing `kind`", () => {
    const text = [
      "```orch8-card",
      '{"summary":"no kind","payload":{}}',
      "```",
    ].join("\n");

    const result = extractCards(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].kind).toBe("result_error");
    expect((result.cards[0].payload as { reason: string }).reason).toContain("missing");
  });

  it("is resilient to extra whitespace and trailing commas are rejected", () => {
    const text = "```orch8-card\n\n" +
      '  {"kind":"info_run_list","summary":"2 runs","payload":{"n":2}}  ' +
      "\n\n```";
    const result = extractCards(text);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].kind).toBe("info_run_list");
  });

  it("exports the FENCE_OPEN and FENCE_CLOSE constants", () => {
    expect(FENCE_OPEN).toBe("```orch8-card");
    expect(FENCE_CLOSE).toBe("```");
  });
});
