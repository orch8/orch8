import { describe, it, expect, vi } from "vitest";
import { renderWithProviders, screen } from "../test-utils.js";
import userEvent from "@testing-library/user-event";
import { WizardStepper } from "../components/shared/WizardStepper.js";

const steps = [
  { label: "Template", content: <div>Step 1 content</div> },
  { label: "Identity", content: <div>Step 2 content</div> },
  { label: "Prompts", content: <div>Step 3 content</div> },
];

describe("WizardStepper", () => {
  it("renders step labels", () => {
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={0} onStepChange={() => {}} />,
    );
    expect(screen.getByText("Template")).toBeInTheDocument();
    expect(screen.getByText("Identity")).toBeInTheDocument();
    expect(screen.getByText("Prompts")).toBeInTheDocument();
  });

  it("renders current step content", () => {
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={0} onStepChange={() => {}} />,
    );
    expect(screen.getByText("Step 1 content")).toBeInTheDocument();
    expect(screen.queryByText("Step 2 content")).not.toBeInTheDocument();
  });

  it("shows Next button on non-final steps", () => {
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={0} onStepChange={() => {}} />,
    );
    expect(screen.getByText("Next")).toBeInTheDocument();
    expect(screen.queryByText("Back")).not.toBeInTheDocument();
  });

  it("shows Back button on steps after first", () => {
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={1} onStepChange={() => {}} />,
    );
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Next")).toBeInTheDocument();
  });

  it("calls onStepChange when Next is clicked", async () => {
    const onStepChange = vi.fn();
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={0} onStepChange={onStepChange} />,
    );
    await userEvent.click(screen.getByText("Next"));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it("calls onStepChange when Back is clicked", async () => {
    const onStepChange = vi.fn();
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={2} onStepChange={onStepChange} />,
    );
    await userEvent.click(screen.getByText("Back"));
    expect(onStepChange).toHaveBeenCalledWith(1);
  });

  it("renders onComplete button on final step", async () => {
    const onComplete = vi.fn();
    renderWithProviders(
      <WizardStepper
        steps={steps}
        currentStep={2}
        onStepChange={() => {}}
        onComplete={onComplete}
        completeLabel="Create Agent"
      />,
    );
    const btn = screen.getByText("Create Agent");
    await userEvent.click(btn);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("highlights current step in progress indicator", () => {
    renderWithProviders(
      <WizardStepper steps={steps} currentStep={1} onStepChange={() => {}} />,
    );
    const identityEl = screen.getByText("Identity");
    expect(identityEl.className).toContain("text-zinc-100");
  });
});
