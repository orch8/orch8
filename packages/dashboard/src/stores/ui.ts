import { create } from "zustand";

interface UiState {
  // Panel state
  activePanel: "task" | "agent" | "memory" | "brainstorm" | null;
  setActivePanel: (panel: UiState["activePanel"]) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: null,
  setActivePanel: (panel) => set({ activePanel: panel }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
