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

  it("falls back to a generic info card for an unknown info_* kind", () => {
    renderCard(
      makeExtracted({
        kind: "info_unknown_widget" as ExtractedCard["kind"],
        summary: "some summary",
        payload: { count: 42 },
      }),
    );
    // Humanized kind appears as the card title
    expect(screen.getByText(/unknown widget/i)).toBeInTheDocument();
    // Payload keys/values are rendered
    expect(screen.getByText("count")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    // No approve/cancel chrome on info fallback
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("falls back to a generic result card for an unknown result_* kind", () => {
    renderCard(
      makeExtracted({
        kind: "result_mystery_action" as ExtractedCard["kind"],
        summary: "Something happened",
        payload: { value: "ok" },
        status: "approved",
      }),
    );
    // Summary is used as the title when available on result fallback
    expect(screen.getByText(/something happened/i)).toBeInTheDocument();
    // Payload rendered
    expect(screen.getByText("value")).toBeInTheDocument();
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("falls back to a generic info card for a truly unrecognizable kind", () => {
    renderCard(
      makeExtracted({
        kind: "weird_thing" as ExtractedCard["kind"],
        summary: "nonsense",
        payload: { x: 1 },
      }),
    );
    // The unknown-prefix path lands on GenericInfoFallback
    expect(screen.getByText(/weird thing/i)).toBeInTheDocument();
    expect(screen.getByText("x")).toBeInTheDocument();
    // No "payload failed validation" or error-ish copy is shown
    expect(screen.queryByText(/payload failed validation/i)).not.toBeInTheDocument();
  });

  it("does not show a 'payload failed validation' message for unknown kinds", () => {
    renderCard(
      makeExtracted({
        kind: "confirm_destroy_universe" as ExtractedCard["kind"],
        payload: {},
      }),
    );
    expect(screen.queryByText(/payload failed validation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/failed to parse/i)).not.toBeInTheDocument();
  });

  it("routes known kinds to their dedicated component, not the fallback", () => {
    // A known info_task_list with a valid payload should render the real
    // InfoTaskListCard (which surfaces the task count), not the generic
    // fallback (which would render a `tasks` key/value pair).
    renderCard(
      makeExtracted({
        kind: "info_task_list",
        summary: "2 tasks",
        payload: {
          tasks: [
            { id: "task_a", title: "T1", column: "backlog" },
            { id: "task_b", title: "T2", column: "done" },
          ],
        },
      }),
    );
    // The real component renders the task titles as link text.
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("T2")).toBeInTheDocument();
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
