import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useChats, useCreateChat } from "../hooks/useChats.js";
import { api } from "../api/client.js";

vi.mock("../api/client.js", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useChats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /projects/:projectId/chats", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "chat_1",
        projectId: "proj_a",
        agentId: "chat",
        title: "T",
        pinned: false,
        archived: false,
        lastMessageAt: "2026-04-07T00:00:00Z",
        createdAt: "2026-04-07T00:00:00Z",
        updatedAt: "2026-04-07T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() => useChats("proj_a"), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/projects/proj_a/chats", { includeArchived: undefined });
    expect(result.current.data).toHaveLength(1);
  });

  it("includes ?includeArchived=true when opt is set", async () => {
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { result } = renderHook(
      () => useChats("proj_a", { includeArchived: true }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/projects/proj_a/chats", { includeArchived: "true" });
  });
});

describe("useCreateChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs the new chat and returns the row", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "chat_new",
      projectId: "proj_a",
      agentId: "chat",
      title: "New chat",
      pinned: false,
      archived: false,
      lastMessageAt: "2026-04-07T00:00:00Z",
      createdAt: "2026-04-07T00:00:00Z",
      updatedAt: "2026-04-07T00:00:00Z",
    });

    const { result } = renderHook(() => useCreateChat(), { wrapper: makeWrapper() });
    const chat = await result.current.mutateAsync({ projectId: "proj_a" });
    expect(chat.id).toBe("chat_new");
    expect(api.post).toHaveBeenCalledWith("/projects/proj_a/chats", {
      projectId: "proj_a",
      agentId: undefined,
      title: undefined,
    });
  });
});
