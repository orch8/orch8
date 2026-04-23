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
    expect(btn.className).toMatch(/bg-secondary/);
    expect(btn.className).toMatch(/text-secondary-foreground/);
  });

  it("maps the legacy primary variant to the t3code default variant", () => {
    render(<Button variant="primary">Go</Button>);
    expect(screen.getByRole("button").className).toMatch(/bg-primary/);
  });

  it("maps the legacy danger variant to an outline-only destructive variant", () => {
    render(<Button variant="danger">Delete</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toMatch(/destructive-foreground/);
    expect(cls).not.toMatch(/bg-destructive /);
  });
});
