import { create } from "zustand";

const SIDEBAR_STORAGE_KEY = "orch8:sidebar-open";

function readStoredSidebarOpen(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.localStorage?.getItem !== "function") return true;
  const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  return stored == null ? true : stored === "true";
}

function persistSidebarOpen(open: boolean) {
  if (typeof window === "undefined") return;
  if (typeof window.localStorage?.setItem !== "function") return;
  window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
}

interface UiState {
  // Panel state
  activePanel: "task" | "agent" | "memory" | "brainstorm" | null;
  setActivePanel: (panel: UiState["activePanel"]) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Drawers (one at a time — opening one closes the other)
  activeDrawer: string | null;
  openDrawer: (name: string) => void;
  closeDrawer: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: null,
  setActivePanel: (panel) => set({ activePanel: panel }),

  sidebarOpen: readStoredSidebarOpen(),
  toggleSidebar: () =>
    set((s) => {
      const sidebarOpen = !s.sidebarOpen;
      persistSidebarOpen(sidebarOpen);
      return { sidebarOpen };
    }),
  setSidebarOpen: (sidebarOpen) => {
    persistSidebarOpen(sidebarOpen);
    set({ sidebarOpen });
  },

  activeDrawer: null,
  openDrawer: (name) => set({ activeDrawer: name }),
  closeDrawer: () => set({ activeDrawer: null }),
}));
