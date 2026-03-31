import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../components/shared/ConfirmDialog.js";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    renderWithProviders(
      <ConfirmDialog
        open={false}
        title="Delete?"
        description="Are you sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText("Delete?")).not.toBeInTheDocument();
  });

  it("renders title and description when open", () => {
    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Delete Agent?"
        description="This will permanently remove the agent."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Delete Agent?")).toBeInTheDocument();
    expect(screen.getByText("This will permanently remove the agent.")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", async () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Restart?"
        description="This will restart the daemon."
        onConfirm={onConfirm}
        onCancel={() => {}}
        confirmLabel="Restart"
      />,
    );
    await userEvent.click(screen.getByText("Restart"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when cancel button clicked", async () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Delete?"
        description="Sure?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses destructive styling by default", () => {
    renderWithProviders(
      <ConfirmDialog
        open={true}
        title="Delete?"
        description="Sure?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const confirmBtn = screen.getByText("Confirm");
    expect(confirmBtn.className).toContain("bg-red");
  });
});
