import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { ChatMessageRenderer } from "../components/chat/ChatMessageRenderer.js";
import type { ExtractedCard } from "@orch/shared";

const router = createRouter({
  routeTree: createRootRoute({ component: () => <div /> }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

function renderMsg(content: string, cards: ExtractedCard[] = []) {
  return render(
    <RouterContextProvider router={router}>
      <ChatMessageRenderer projectId="proj_a" chatId="chat_a" content={content} cards={cards} />
    </RouterContextProvider>,
  );
}

describe("ChatMessageRenderer", () => {
  it("renders plain markdown", () => {
    renderMsg("Just **bold** text.");
    const bold = screen.getByText("bold");
    expect(bold.tagName.toLowerCase()).toBe("strong");
  });

  it("auto-links task IDs in prose", () => {
    renderMsg("Looking at task_abc now");
    expect(screen.getByText("task_abc").tagName.toLowerCase()).toBe("a");
  });

  it("does NOT auto-link IDs inside fenced code blocks", () => {
    renderMsg("```\ntask_abc\n```");
    // Inside `code` the ID stays plain text
    const code = screen.getByText("task_abc");
    expect(code.closest("a")).toBeNull();
  });

  it("renders an orch8-card fence via CardRegistry (Plan 05)", () => {
    const fenced = [
      "Here is a card:",
      "```orch8-card",
      '{"kind":"info_task_list","summary":"0 tasks","payload":{"tasks":[]}}',
      "```",
    ].join("\n");
    renderMsg(fenced, [
      {
        id: "card_1",
        kind: "info_task_list",
        summary: "0 tasks",
        payload: { tasks: [] },
        status: "pending",
        decidedAt: null,
        decidedBy: null,
        resultRunId: null,
      },
    ]);
    // CardRegistry dispatches to InfoTaskListCard which renders the title
    // AND the summary, both "0 tasks".
    expect(screen.getAllByText("0 tasks").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Here is a card:")).toBeInTheDocument();
  });

  it("renders multiple cards in order", () => {
    const fenced = [
      "First:",
      "```orch8-card",
      '{"kind":"a"}',
      "```",
      "Second:",
      "```orch8-card",
      '{"kind":"b"}',
      "```",
    ].join("\n");
    const cards: ExtractedCard[] = [
      { id: "c1", kind: "a", summary: "", payload: {}, status: "pending", decidedAt: null, decidedBy: null, resultRunId: null },
      { id: "c2", kind: "b", summary: "", payload: {}, status: "pending", decidedAt: null, decidedBy: null, resultRunId: null },
    ];
    renderMsg(fenced, cards);
    // Unknown kinds fall back to ResultErrorCard via CardRegistry's validation guard.
    const errors = screen.getAllByText(/payload failed validation/i);
    expect(errors).toHaveLength(2);
  });
});
