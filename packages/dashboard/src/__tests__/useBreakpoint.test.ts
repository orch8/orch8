import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBreakpoint } from "../hooks/useBreakpoint.js";

// Stub matchMedia — happy-dom doesn't implement it.
let listeners: Map<string, (e: { matches: boolean }) => void>;
let mediaMatches: Map<string, boolean>;

beforeEach(() => {
  listeners = new Map();
  mediaMatches = new Map();
  mediaMatches.set("(max-width: 767px)", false); // not mobile
  mediaMatches.set("(max-width: 1023px)", false); // not narrow

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
});

afterEach(() => {
  listeners.clear();
  mediaMatches.clear();
});

function fireMediaChange(query: string, matches: boolean) {
  const cb = listeners.get(query);
  if (cb) cb({ matches });
}

describe("useBreakpoint", () => {
  it("returns desktop state by default (both queries false)", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toEqual({
      isMobile: false,
      isNarrow: false,
      isDesktop: true,
    });
  });

  it("returns narrow when <1024px but ≥768px", () => {
    mediaMatches.set("(max-width: 1023px)", true);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toEqual({
      isMobile: false,
      isNarrow: true,
      isDesktop: false,
    });
  });

  it("returns mobile when <768px (also narrow)", () => {
    mediaMatches.set("(max-width: 767px)", true);
    mediaMatches.set("(max-width: 1023px)", true);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toEqual({
      isMobile: true,
      isNarrow: true,
      isDesktop: false,
    });
  });

  it("updates reactively when viewport changes", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(true);

    act(() => {
      fireMediaChange("(max-width: 1023px)", true);
    });

    expect(result.current.isNarrow).toBe(true);
    expect(result.current.isDesktop).toBe(false);
  });
});
