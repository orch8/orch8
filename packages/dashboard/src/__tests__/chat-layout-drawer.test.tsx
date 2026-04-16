import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithProviders, screen, act } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { ChatLayout } from "../components/chat/ChatLayout.js";
import { useUiStore } from "../stores/ui.js";

// matchMedia stub — happy-dom doesn't implement it. We configure "narrow"
// (<1024px) to exercise the drawer branch in ChatLayout.
function installMatchMedia(narrow: boolean) {
  const listeners = new Map<string, (e: { matches: boolean }) => void>();
  const mediaMatches = new Map<string, boolean>();
  mediaMatches.set("(max-width: 767px)", false);
  mediaMatches.set("(max-width: 1023px)", narrow);

  window.matchMedia = vi.fn((query: string) => {
    const mql = {
      matches: mediaMatches.get(query) ?? false,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
        listeners.set(query, cb);
      },
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    return mql;
  });
}

// Mock useChats so the thread list inside the drawer doesn't try to fetch.
vi.mock("../hooks/useChats.js", async () => {
  const actual = await vi.importActual<typeof import("../hooks/useChats.js")>(
    "../hooks/useChats.js",
  );
  return {
    ...actual,
    useChats: () => ({ data: [], isLoading: false }),
  };
});

beforeEach(() => {
  // Reset UI store drawer state before each test.
  act(() => {
    useUiStore.setState({ activeDrawer: null });
  });
});

afterEach(() => {
  act(() => {
    useUiStore.setState({ activeDrawer: null });
  });
});

describe("ChatLayout <lg (narrow) drawer", () => {
  it("does not render the drawer panel by default at narrow viewports", () => {
    installMatchMedia(true);
    renderWithProviders(
      <ChatLayout projectId="proj_a">
        <div>chat body</div>
      </ChatLayout>,
    );

    // Drawer is closed by default → no dialog is rendered.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Chat body itself still renders.
    expect(screen.getByText("chat body")).toBeInTheDocument();
  });

  it("renders the drawer panel when activeDrawer === 'threads'", () => {
    installMatchMedia(true);
    renderWithProviders(
      <ChatLayout projectId="proj_a">
        <div>chat body</div>
      </ChatLayout>,
    );

    act(() => {
      useUiStore.getState().openDrawer("threads");
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("drawer-backdrop")).toBeInTheDocument();
  });

  it("closes the drawer when the backdrop is clicked", async () => {
    installMatchMedia(true);
    renderWithProviders(
      <ChatLayout projectId="proj_a">
        <div>chat body</div>
      </ChatLayout>,
    );

    act(() => {
      useUiStore.getState().openDrawer("threads");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("drawer-backdrop"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useUiStore.getState().activeDrawer).toBeNull();
  });

  it("closes the drawer on Escape key", () => {
    installMatchMedia(true);
    renderWithProviders(
      <ChatLayout projectId="proj_a">
        <div>chat body</div>
      </ChatLayout>,
    );

    act(() => {
      useUiStore.getState().openDrawer("threads");
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useUiStore.getState().activeDrawer).toBeNull();
  });

  it("does NOT wrap the thread list in a drawer at desktop viewports", () => {
    // isNarrow === false → the thread list is rendered inline, no drawer.
    installMatchMedia(false);
    renderWithProviders(
      <ChatLayout projectId="proj_a">
        <div>chat body</div>
      </ChatLayout>,
    );

    // Even if someone calls openDrawer, the desktop branch never mounts a Drawer.
    act(() => {
      useUiStore.getState().openDrawer("threads");
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("drawer-backdrop")).not.toBeInTheDocument();
  });
});
