import { create } from "zustand";

interface UiState {
  // Project selection
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;

  // Task selection and detail panel
  selectedTaskId: string | null;
  selectTask: (id: string | null) => void;

  // Agent selection
  selectedAgentId: string | null;
  selectAgent: (id: string | null) => void;

  // Panel state
  activePanel: "task" | "agent" | "memory" | "brainstorm" | null;
  setActivePanel: (panel: UiState["activePanel"]) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Run inspector
  selectedRunId: string | null;
  selectRun: (id: string | null) => void;

  // Memory browser
  selectedEntityId: string | null;
  selectEntity: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProject: (id) => set({ activeProjectId: id }),

  selectedTaskId: null,
  selectTask: (id) =>
    set({ selectedTaskId: id, activePanel: id ? "task" : null }),

  selectedAgentId: null,
  selectAgent: (id) =>
    set({ selectedAgentId: id, activePanel: id ? "agent" : null }),

  activePanel: null,
  setActivePanel: (panel) => set({ activePanel: panel }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  selectedRunId: null,
  selectRun: (id) => set({ selectedRunId: id }),

  selectedEntityId: null,
  selectEntity: (id) => set({ selectedEntityId: id }),
}));
