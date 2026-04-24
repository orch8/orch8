import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { MarkdownRenderer } from "../components/shared/MarkdownRenderer.js";

describe("MarkdownRenderer", () => {
  it("renders plain text", () => {
    renderWithProviders(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders bold text", () => {
    renderWithProviders(<MarkdownRenderer content="**bold text**" />);
    expect(screen.getByText("bold text")).toBeInTheDocument();
    expect(screen.getByText("bold text").tagName).toBe("STRONG");
  });

  it("renders fenced code blocks", () => {
    const { container } = renderWithProviders(
      <MarkdownRenderer content={'```js\nconsole.log("hi")\n```'} />,
    );
    // rehype-highlight splits tokens into spans, so check via the code element
    const codeEl = container.querySelector("code.hljs");
    expect(codeEl).toBeTruthy();
    expect(codeEl!.textContent).toContain('console.log("hi")');
  });

  it("renders GFM tables", () => {
    const table = "| A | B |\n|---|---|\n| 1 | 2 |";
    renderWithProviders(<MarkdownRenderer content={table} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders task references as links", () => {
    renderWithProviders(<MarkdownRenderer content="See TASK-42 for details" />);
    const link = screen.getByRole("link", { name: "TASK-42" });
    expect(link).toHaveAttribute("href", "/board?task=42");
  });

  it("renders agent mentions as links when projectSlug is provided", () => {
    renderWithProviders(
      <MarkdownRenderer content="@qa-bot please review" projectSlug="proj_a" />,
    );
    const link = screen.getByRole("link", { name: "@qa-bot" });
    expect(link).toHaveAttribute("href", "/projects/proj_a/agents/qa-bot");
  });

  it("leaves agent mentions as text without projectSlug", () => {
    renderWithProviders(<MarkdownRenderer content="@qa-bot please review" />);
    expect(screen.queryByRole("link", { name: "@qa-bot" })).toBeNull();
    expect(screen.getByText("@qa-bot please review")).toBeInTheDocument();
  });

  it("renders external links with target=_blank", () => {
    renderWithProviders(
      <MarkdownRenderer content="[Example](https://example.com)" />,
    );
    const link = screen.getByRole("link", { name: "Example" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("applies prose styling classes", () => {
    const { container } = renderWithProviders(
      <MarkdownRenderer content="# Heading" />,
    );
    expect(container.querySelector(".prose")).toBeTruthy();
  });
});
