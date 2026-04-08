import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { ChatInput } from "../components/chat/ChatInput.js";

// We need to mock the hook before importing the component, but vitest's
// hoisting handles this when we use `vi.mock` at the module top.
vi.mock("../hooks/useChatMessages.js", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useChatMessages.js")>(
    "../hooks/useChatMessages.js",
  );
  return {
    ...actual,
    useSendChatMessage: () => ({
      mutate: vi.fn((args, opts) => opts?.onSuccess?.()),
      isPending: false,
    }),
  };
});

describe("ChatInput", () => {
  it("renders an empty textarea and disabled send button", () => {
    renderWithProviders(<ChatInput chatId="chat_a" />);
    const textarea = screen.getByRole("textbox");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
    const button = screen.getByRole("button", { name: /send/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables the send button when the user types", async () => {
    renderWithProviders(<ChatInput chatId="chat_a" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "hello");
    const button = screen.getByRole("button", { name: /send/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("clears the textarea on submit", async () => {
    renderWithProviders(<ChatInput chatId="chat_a" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(textarea, "hello");
    const button = screen.getByRole("button", { name: /send/i });
    await user.click(button);
    expect(textarea.value).toBe("");
  });

  it("submits on Enter (no shift)", async () => {
    renderWithProviders(<ChatInput chatId="chat_a" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(textarea, "hello");
    await user.keyboard("{Enter}");
    expect(textarea.value).toBe("");
  });

  it("does not submit on Shift+Enter", async () => {
    renderWithProviders(<ChatInput chatId="chat_a" />);
    const user = userEvent.setup();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await user.type(textarea, "hello");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(textarea.value).toContain("hello");
  });
});
