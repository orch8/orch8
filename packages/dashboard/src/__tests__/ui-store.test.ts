// packages/dashboard/src/__tests__/ui-store.test.ts
import { describe, it, expect } from "vitest";
import { useUiStore } from "../stores/ui.js";

describe("useUiStore (slimmed)", () => {
  it("has activePanel field with setter", () => {
    const state = useUiStore.getState();
    expect(state.activePanel).toBe(null);
    state.setActivePanel("task");
    expect(useUiStore.getState().activePanel).toBe("task");
  });

  it("has sidebarOpen field with toggle", () => {
    const state = useUiStore.getState();
    const before = state.sidebarOpen;
    state.toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(!before);
  });

  it("does NOT have activeProjectId", () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("activeProjectId");
  });

  it("does NOT have selectedTaskId", () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("selectedTaskId");
  });

  it("does NOT have selectedAgentId", () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("selectedAgentId");
  });

  it("does NOT have selectedRunId", () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("selectedRunId");
  });

  it("does NOT have selectedEntityId", () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state).not.toHaveProperty("selectedEntityId");
  });

  it("has activeDrawer field (null by default)", () => {
    const state = useUiStore.getState();
    expect(state.activeDrawer).toBe(null);
  });

  it("openDrawer sets activeDrawer to the given name", () => {
    useUiStore.getState().openDrawer("sidebar");
    expect(useUiStore.getState().activeDrawer).toBe("sidebar");
  });

  it("openDrawer replaces the previous drawer (only one at a time)", () => {
    useUiStore.getState().openDrawer("sidebar");
    useUiStore.getState().openDrawer("threads");
    expect(useUiStore.getState().activeDrawer).toBe("threads");
  });

  it("closeDrawer sets activeDrawer to null", () => {
    useUiStore.getState().openDrawer("sidebar");
    useUiStore.getState().closeDrawer();
    expect(useUiStore.getState().activeDrawer).toBe(null);
  });
});
