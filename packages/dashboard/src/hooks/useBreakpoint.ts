import { useSyncExternalStore } from "react";

interface Breakpoints {
  isMobile: boolean;
  isNarrow: boolean;
  isDesktop: boolean;
}

const MOBILE_QUERY = "(max-width: 767px)";
const NARROW_QUERY = "(max-width: 1023px)";

/**
 * Creates a tiny external store for a single media query.
 * Keeps a cached `matches` value so that getSnapshot is stable
 * even when matchMedia returns fresh objects per call (as stubs do).
 */
function createMediaStore(query: string) {
  let currentMatches: boolean | undefined;

  function getMatches(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }

  function subscribe(cb: () => void) {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    currentMatches = mql.matches;

    const handler = (e: MediaQueryListEvent | { matches: boolean }) => {
      currentMatches = e.matches;
      cb();
    };

    mql.addEventListener("change", handler as EventListener);
    return () => mql.removeEventListener("change", handler as EventListener);
  }

  function getSnapshot(): boolean {
    if (currentMatches === undefined) {
      currentMatches = getMatches();
    }
    return currentMatches;
  }

  return { subscribe, getSnapshot };
}

const mobileStore = createMediaStore(MOBILE_QUERY);
const narrowStore = createMediaStore(NARROW_QUERY);
const serverSnapshot = () => false;

export function useBreakpoint(): Breakpoints {
  const isMobile = useSyncExternalStore(
    mobileStore.subscribe,
    mobileStore.getSnapshot,
    serverSnapshot,
  );
  const isNarrow = useSyncExternalStore(
    narrowStore.subscribe,
    narrowStore.getSnapshot,
    serverSnapshot,
  );

  return { isMobile, isNarrow, isDesktop: !isNarrow };
}
