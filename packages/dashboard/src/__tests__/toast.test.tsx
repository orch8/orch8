import { describe, it, expect, beforeEach } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import { ToastContainer } from "../components/notifications/ToastContainer.js";
import { useToastStore } from "../stores/toast.js";

describe("ToastContainer", () => {
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  it("renders nothing when no toasts", () => {
    const { container } = renderWithProviders(<ToastContainer />);
    expect(container.querySelector("[data-toast]")).toBeNull();
  });

  it("renders toast when added to store", async () => {
    renderWithProviders(<ToastContainer />);

    useToastStore.getState().add({
      id: "t1",
      type: "agent_failure",
      title: "Agent crashed",
      message: "Engineer failed with exit code 1",
    });

    await waitFor(() => {
      expect(screen.getByText("Agent crashed")).toBeInTheDocument();
      expect(screen.getByText("Engineer failed with exit code 1")).toBeInTheDocument();
    });
  });

  it("limits visible toasts to 3", async () => {
    renderWithProviders(<ToastContainer />);

    for (let i = 0; i < 5; i++) {
      useToastStore.getState().add({
        id: `t${i}`,
        type: "task_completed",
        title: `Task ${i}`,
        message: `Completed ${i}`,
      });
    }

    await waitFor(() => {
      const toasts = screen.getAllByTestId("toast-item");
      expect(toasts.length).toBeLessThanOrEqual(3);
    });
  });
});
