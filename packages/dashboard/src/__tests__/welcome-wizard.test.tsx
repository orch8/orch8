import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

describe("WelcomeWizard", () => {
  it("renders welcome step first", () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} />);
    expect(screen.getByText("Welcome to orch8")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("advances to Create Project step", async () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} />);
    await userEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Create Project")).toBeInTheDocument();
  });

  it("shows all 5 step labels", () => {
    renderWithProviders(<WelcomeWizard onComplete={() => {}} />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("First Task")).toBeInTheDocument();
  });
});
