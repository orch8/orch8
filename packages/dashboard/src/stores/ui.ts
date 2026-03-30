import { create } from "zustand";

interface UiState {
  selectedTaskId: string | null;
  activePanel: "task" | "agent" | "memory" | "brainstorm" | null;
  sidebarOpen: boolean;
  selectTask: (id: string | null) => void;
  setActivePanel: (panel: UiState["activePanel"]) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedTaskId: null,
  activePanel: null,
  sidebarOpen: true,
  selectTask: (id) => set({ selectedTaskId: id }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
