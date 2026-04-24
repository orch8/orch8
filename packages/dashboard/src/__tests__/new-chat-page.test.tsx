// Regression test for the "new chat is stuck on Creating new chat…" bug.
//
// Root cause: passing a mutate-level `onSuccess` callback to
// `createChat.mutate()` is unreliable when the mutation is fired from a
// `useEffect` inside a `<RouterProvider>` + `<StrictMode>` tree (which is
// exactly how NewChatPage mounts). During the combined StrictMode
// simulated-remount and TanStack Router initial route transition, the
// MutationObserver's last listener is removed, and `onUnsubscribe` detaches
// the observer from the in-flight mutation. Since there is no re-attach on
// re-subscribe, `MutationObserver#notify` is never called when the mutation
// resolves, silently dropping the mutate-level callback.
//
// The fix is to use `mutateAsync` and await its promise — that promise is
// returned directly by `Mutation.execute()` and is independent of observer
// attachment.
//
// This test mocks `@tanstack/react-router`'s `useNavigate` so we can assert
// that NewChatPage's effect reliably calls `navigate` after the mutation
// resolves under StrictMode — the exact behavior that was broken.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrictMode } from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../api/client.js";

const navigateSpy = vi.fn();

vi.mock("../api/client.js", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  ApiError: class extends Error {},
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
    // NewChatPage calls `Route.useParams()` inside its body. Return a
    // fixed projectId so the component can render without a real router.
    useParams: () => ({ projectSlug: "proj_1" }),
  }),
  useNavigate: () => navigateSpy,
}));

function makeQc() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

describe("NewChatPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls navigate with the new chat id after mutateAsync resolves (under StrictMode + hook-level invalidate)", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "chat_abc",
      projectId: "proj_1",
      agentId: "chat",
      title: "New chat",
      pinned: false,
      archived: false,
      lastMessageAt: "2026-04-09T00:00:00Z",
      createdAt: "2026-04-09T00:00:00Z",
      updatedAt: "2026-04-09T00:00:00Z",
    });

    // Import dynamically so the mocks above are in place before the module
    // is evaluated.
    const mod = await import("../routes/projects/$projectSlug/chat/new.js");
    const NewChatPage = mod.Route.options.component as React.ComponentType;

    render(
      <StrictMode>
        <QueryClientProvider client={makeQc()}>
          <NewChatPage />
        </QueryClientProvider>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/projects/proj_1/chats", {
        projectId: "proj_1",
        agentId: undefined,
        title: undefined,
      });
    });

    await waitFor(
      () => {
        expect(navigateSpy).toHaveBeenCalledWith({
          to: "/projects/$projectSlug/chat/$chatId",
          params: { projectSlug: "proj_1", chatId: "chat_abc" },
          replace: true,
        });
      },
      { timeout: 2000 },
    );
  });

  it("shows an error state when the create call fails (does not get stuck on 'Creating new chat…')", async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    const mod = await import("../routes/projects/$projectSlug/chat/new.js");
    const NewChatPage = mod.Route.options.component as React.ComponentType;

    const { findByText } = render(
      <StrictMode>
        <QueryClientProvider client={makeQc()}>
          <NewChatPage />
        </QueryClientProvider>
      </StrictMode>,
    );

    await findByText("Failed to create chat.");
    await findByText("boom");
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
