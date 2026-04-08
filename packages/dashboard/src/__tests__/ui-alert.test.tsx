import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "../components/ui/Alert.js";

describe("Alert", () => {
  it("renders title and body", () => {
    render(
      <Alert title="HEADS UP" variant="warn">
        Budget at 80%
      </Alert>,
    );
    expect(screen.getByText("HEADS UP")).toBeInTheDocument();
    expect(screen.getByText("Budget at 80%")).toBeInTheDocument();
  });

  it("uses amber stripe for warn variant", () => {
    const { container } = render(
      <Alert title="x" variant="warn">
        y
      </Alert>,
    );
    const stripe = container.querySelector("[data-stripe]");
    expect(stripe?.className).toMatch(/bg-amber/);
  });

  it("uses red stripe for err variant", () => {
    const { container } = render(
      <Alert title="x" variant="err">
        y
      </Alert>,
    );
    expect(container.querySelector("[data-stripe]")?.className).toMatch(/bg-red/);
  });

  it("never uses a filled colored background", () => {
    const { container } = render(
      <Alert title="x" variant="err">
        y
      </Alert>,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).not.toMatch(/bg-red/);
    expect(root.className).toMatch(/bg-surface/);
  });
});
