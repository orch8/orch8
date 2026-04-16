import { describe, it, expect, expectTypeOf } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { CardRegistry } from "../components/chat/cards/CardRegistry.js";
import type { ChatCard, ExtractedCard } from "@orch/shared";

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
  it("Extract<ChatCard, { kind }> resolves to a concrete variant (not never)", () => {
    // Guards against type-level drift between the @orch/shared ChatCard
    // discriminated union and the card components that Extract from it.
    // If either side diverges (e.g. a component imports a local ChatCard
    // shadowing the shared one), the Extract collapses to `never` and the
    // components silently lose their prop typing.
    expectTypeOf<
      Extract<ChatCard, { kind: "result_create_task" }>
    >().not.toBeNever();
    expectTypeOf<
      Extract<ChatCard, { kind: "confirm_create_task" }>
    >().not.toBeNever();
    expectTypeOf<
      Extract<ChatCard, { kind: "info_task_list" }>
    >().not.toBeNever();
    expectTypeOf<
      Extract<ChatCard, { kind: "result_error" }>
    >().not.toBeNever();
  });

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

  it("falls back to a generic confirm card for an unknown confirm_* kind", () => {
    renderCard(
      makeExtracted({
        kind: "confirm_destroy_universe" as ExtractedCard["kind"],
        payload: {},
      }),
    );
    // Fallback is GenericConfirmFallback — renders the humanized kind as
    // the card title and keeps the Approve/Cancel chrome so the user can
    // still respond to unknown confirmations.
    expect(screen.getByText(/destroy universe/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("falls back to a generic confirm card for a malformed payload", () => {
    renderCard(
      makeExtracted({
        kind: "confirm_move_task",
        payload: { taskId: "task_a" }, // missing from/to
      }),
    );
    // Fallback is GenericConfirmFallback — the card body renders the raw
    // payload as key/value pairs rather than rejecting the card outright.
    expect(screen.getByText(/move task/i)).toBeInTheDocument();
    expect(screen.getByText("taskId")).toBeInTheDocument();
    expect(screen.getByText("task_a")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
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
