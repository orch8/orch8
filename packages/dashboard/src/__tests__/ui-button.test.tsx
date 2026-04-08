import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../components/ui/Button.js";

describe("Button", () => {
  it("renders the children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("uses the secondary variant by default", () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-surface/);
    expect(btn.className).toMatch(/border-edge/);
  });

  it("applies the primary variant when requested", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button").className).toMatch(/bg-accent/);
  });

  it("applies the danger variant as outline-only (no fill)", () => {
    render(<Button variant="danger">Delete</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/border-red/);
    expect(cls).toMatch(/text-red/);
    expect(cls).not.toMatch(/bg-red/);
  });
});
