import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { CardRegistry } from "../components/chat/cards/CardRegistry.js";
import type { ChatCard as ExtractedCard } from "../hooks/useChatMessages.js";

const router = createRouter({
  routeTree: createRootRoute({ component: () => <div /> }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

function makeExtracted(overrides: Partial<ExtractedCard>): ExtractedCard {
  return {
    id: "card_1",
    kind: "info_task_list",
    summary: "0 tasks",
    payload: { tasks: [] },
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
    ...overrides,
  };
}

function renderCard(extracted: ExtractedCard) {
  return renderWithProviders(
    <RouterContextProvider router={router}>
      <CardRegistry extracted={extracted} chatId="chat_a" projectId="proj_a" />
    </RouterContextProvider>,
  );
}

describe("CardRegistry", () => {
  it("renders an info card from a valid extracted payload", () => {
    renderCard(
      makeExtracted({
        kind: "info_task_list",
        summary: "1 task",
        payload: { tasks: [{ id: "task_a", title: "T", column: "backlog" }] },
      }),
    );
    expect(screen.getByText(/1 tasks/)).toBeInTheDocument();
  });

  it("renders a confirm card with Approve and Cancel buttons", () => {
    renderCard(
      makeExtracted({
        kind: "confirm_create_task",
        summary: "Create T",
        payload: { title: "T", priority: "medium" },
      }),
    );
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("falls back to ResultErrorCard for an unknown kind", () => {
    renderCard(
      makeExtracted({
        kind: "confirm_destroy_universe" as ExtractedCard["kind"],
        payload: {},
      }),
    );
    expect(screen.getByText(/payload failed validation/i)).toBeInTheDocument();
  });

  it("falls back to ResultErrorCard for a malformed payload", () => {
    renderCard(
      makeExtracted({
        kind: "confirm_move_task",
        payload: { taskId: "task_a" }, // missing from/to
      }),
    );
    expect(screen.getByText(/payload failed validation/i)).toBeInTheDocument();
  });

  it("renders a result_error card directly", () => {
    renderCard(
      makeExtracted({
        kind: "result_error",
        summary: "Failed to create agent",
        payload: { reason: "boom", httpStatus: 500, endpoint: "/api/agents" },
        status: "error",
      }),
    );
    expect(screen.getByText(/failed to create agent/i)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();
  });
});
