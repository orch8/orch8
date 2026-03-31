import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { BrainstormChat } from "../components/brainstorm/BrainstormChat.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockSend = vi.fn();
const mockSubscribe = vi.fn(() => () => {});

vi.mock("../hooks/useWsEvents.js", () => ({
  useWsEvents: () => ({
    connected: true,
    send: mockSend,
    subscribe: mockSubscribe,
  }),
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockSend.mockReset();
  mockSubscribe.mockReset().mockReturnValue(() => {});
});

describe("BrainstormChat", () => {
  it("renders message input", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ transcript: "" }),
    });

    renderWithProviders(<BrainstormChat taskId="task_1" />);

    expect(
      screen.getByPlaceholderText("Type a message..."),
    ).toBeInTheDocument();
  });

  it("renders Mark as Ready button", () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ transcript: "" }),
    });

    renderWithProviders(<BrainstormChat taskId="task_1" />);

    expect(screen.getByText("Mark as Ready")).toBeInTheDocument();
  });
});
