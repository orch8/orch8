import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import { FormField } from "../components/shared/FormField.js";

describe("FormField", () => {
  it("renders label", () => {
    renderWithProviders(
      <FormField label="Username">
        <input />
      </FormField>,
    );
    expect(screen.getByText("Username")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    renderWithProviders(
      <FormField label="Name" description="Your display name">
        <input />
      </FormField>,
    );
    expect(screen.getByText("Your display name")).toBeInTheDocument();
  });

  it("renders error message when provided", () => {
    renderWithProviders(
      <FormField label="Email" error="Invalid email">
        <input />
      </FormField>,
    );
    expect(screen.getByText("Invalid email")).toBeInTheDocument();
  });

  it("does not render description or error when absent", () => {
    const { container } = renderWithProviders(
      <FormField label="Simple">
        <input />
      </FormField>,
    );
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("renders required indicator when required", () => {
    renderWithProviders(
      <FormField label="Required Field" required>
        <input />
      </FormField>,
    );
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});
