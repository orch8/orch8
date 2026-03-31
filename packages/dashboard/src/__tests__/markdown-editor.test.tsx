import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { MarkdownEditor } from "../components/shared/MarkdownEditor.js";

describe("MarkdownEditor", () => {
  it("renders textarea with placeholder", () => {
    renderWithProviders(
      <MarkdownEditor value="" onChange={() => {}} placeholder="Write here..." />,
    );
    expect(screen.getByPlaceholderText("Write here...")).toBeInTheDocument();
  });

  it("calls onChange when typing", async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <MarkdownEditor value="" onChange={onChange} />,
    );
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "hello");
    expect(onChange).toHaveBeenCalled();
  });

  it("toggles between Write and Preview tabs", async () => {
    renderWithProviders(
      <MarkdownEditor value="**bold**" onChange={() => {}} />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Preview"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Write"));
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onSubmit on Cmd+Enter", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <MarkdownEditor value="test" onChange={() => {}} onSubmit={onSubmit} />,
    );
    const textarea = screen.getByRole("textbox");
    await userEvent.type(textarea, "{Meta>}{Enter}{/Meta}");
    expect(onSubmit).toHaveBeenCalled();
  });

  it("renders toolbar buttons", () => {
    renderWithProviders(
      <MarkdownEditor value="" onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Bold")).toBeInTheDocument();
    expect(screen.getByLabelText("Italic")).toBeInTheDocument();
    expect(screen.getByLabelText("Code")).toBeInTheDocument();
    expect(screen.getByLabelText("Link")).toBeInTheDocument();
  });
});
