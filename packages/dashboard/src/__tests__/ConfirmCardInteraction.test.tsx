import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import {
  RouterContextProvider,
  createRouter,
  createRootRoute,
  createMemoryHistory,
} from "@tanstack/react-router";
import { CardRegistry } from "../components/chat/cards/CardRegistry.js";
import type { ChatCard as ExtractedCard } from "../hooks/useChatMessages.js";

const mockMutate = vi.fn();
vi.mock("../hooks/useCardDecision.js", () => ({
  useCardDecision: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

const router = createRouter({
  routeTree: createRootRoute({ component: () => <div /> }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

function makeCard(): ExtractedCard {
  return {
    id: "card_42",
    kind: "confirm_create_task",
    summary: "Create T",
    payload: { title: "T" },
    status: "pending",
    decidedAt: null,
    decidedBy: null,
    resultRunId: null,
  };
}

describe("Confirm card interactions", () => {
  it("clicking Approve calls useCardDecision with decision='approved'", async () => {
    mockMutate.mockClear();
    renderWithProviders(
      <RouterContextProvider router={router}>
        <CardRegistry extracted={makeCard()} chatId="chat_a" projectId="proj_a" />
      </RouterContextProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /approve/i }));
    expect(mockMutate).toHaveBeenCalledWith({
      chatId: "chat_a",
      cardId: "card_42",
      decision: "approved",
    });
  });

  it("clicking Cancel calls useCardDecision with decision='cancelled'", async () => {
    mockMutate.mockClear();
    renderWithProviders(
      <RouterContextProvider router={router}>
        <CardRegistry extracted={makeCard()} chatId="chat_a" projectId="proj_a" />
      </RouterContextProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockMutate).toHaveBeenCalledWith({
      chatId: "chat_a",
      cardId: "card_42",
      decision: "cancelled",
    });
  });

  it("buttons are disabled once status is approved", () => {
    renderWithProviders(
      <RouterContextProvider router={router}>
        <CardRegistry
          extracted={{ ...makeCard(), status: "approved" }}
          chatId="chat_a"
          projectId="proj_a"
        />
      </RouterContextProvider>,
    );
    const approve = screen.getByRole("button", { name: /approve/i }) as HTMLButtonElement;
    const cancel = screen.getByRole("button", { name: /cancel/i }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
  });
});
