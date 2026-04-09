import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { Modal } from "../components/ui/Modal.js";
import userEvent from "@testing-library/user-event";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    renderWithProviders(
      <Modal open={false} onClose={() => {}} title="Test">
        <p>body</p>
      </Modal>,
    );
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    renderWithProviders(
      <Modal open={true} onClose={() => {}} title="Create Task">
        <p>form here</p>
      </Modal>,
    );
    expect(screen.getByText("Create Task")).toBeInTheDocument();
    expect(screen.getByText("form here")).toBeInTheDocument();
  });

  it("has dialog role and aria-modal", () => {
    renderWithProviders(
      <Modal open={true} onClose={() => {}} title="Test">
        <p>body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open={true} onClose={onClose} title="Test">
        <p>body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape via useModalA11y", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Modal open={true} onClose={onClose} title="Test">
        <p>body</p>
      </Modal>,
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
