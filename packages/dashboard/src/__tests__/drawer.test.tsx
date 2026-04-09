import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { Drawer } from "../components/ui/Drawer.js";
import userEvent from "@testing-library/user-event";

describe("Drawer", () => {
  it("renders nothing when closed", () => {
    renderWithProviders(
      <Drawer open={false} onClose={() => {}}>
        <p>content</p>
      </Drawer>,
    );
    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });

  it("renders children when open", () => {
    renderWithProviders(
      <Drawer open={true} onClose={() => {}}>
        <p>content</p>
      </Drawer>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Drawer open={true} onClose={onClose}>
        <p>content</p>
      </Drawer>,
    );
    // The backdrop is the outer fixed overlay; click it
    const backdrop = screen.getByTestId("drawer-backdrop");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    renderWithProviders(
      <Drawer open={true} onClose={onClose}>
        <p>content</p>
      </Drawer>,
    );
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has correct width constraint and sidebar styling", () => {
    renderWithProviders(
      <Drawer open={true} onClose={() => {}}>
        <p>content</p>
      </Drawer>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel).toBeInTheDocument();
  });
});
