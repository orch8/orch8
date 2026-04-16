// packages/dashboard/src/components/agent-editor/AgentWizard.tsx
import { useState } from "react";
import { WizardStepper } from "../shared/WizardStepper.js";
import { TemplateStep } from "./TemplateStep.js";
import { IdentityStep, type IdentityData } from "./IdentityStep.js";
import { PermissionsStep, type PermissionsData } from "./PermissionsStep.js";
import { BudgetStep, type BudgetData } from "./BudgetStep.js";
import { useCreateAgent, useAgents } from "../../hooks/useAgents.js";
import type { BundledAgent } from "@orch/shared";

interface AgentWizardProps {
  projectId: string;
  onCreated: (agentId: string) => void;
}

export function AgentWizard({ projectId, onCreated }: AgentWizardProps) {
  const [step, setStep] = useState(0);
  const createAgent = useCreateAgent();
  const { data: existingAgents } = useAgents(projectId);

  // Store both the selected ID and the full bundled agent data
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedBundled, setSelectedBundled] = useState<BundledAgent | null>(null);

  const [identity, setIdentity] = useState<IdentityData>({
    name: "",
    slug: "",
    model: "claude-opus-4-7",
    effort: "xhigh",
    maxTurns: 180,
  });
  const [permissions, setPermissions] = useState<PermissionsData>({
    canCreateTasks: false,
    canMoveTo: [],
    canAssignTo: [],
  });
  const [budget, setBudget] = useState<BudgetData>({
    totalBudgetLimit: "",
    autoPauseThreshold: "90",
  });

  function handleTemplateSelect(agent: BundledAgent) {
    setSelectedTemplate(agent.id);
    setSelectedBundled(agent.id === "blank" ? null : agent);

    // Pre-fill identity from bundled data
    setIdentity((prev) => ({
      ...prev,
      name: agent.name,
      slug: agent.id === "blank" ? "" : agent.id,
      model: agent.model,
      effort: agent.effort ?? "medium",
      maxTurns: agent.maxTurns,
    }));

    // Permissions stay at defaults — role defaults are applied server-side
    setPermissions((prev) => ({
      ...prev,
      canCreateTasks: false,
      canMoveTo: [],
    }));
  }

  async function handleCreate() {
    await createAgent.mutateAsync({
      id: identity.slug,
      projectId,
      name: identity.name,
      role: (selectedBundled?.role ?? "custom") as any,
      model: identity.model,
      effort: identity.effort || undefined,
      maxTurns: identity.maxTurns,
      desiredSkills:
        selectedBundled?.skills && selectedBundled.skills.length > 0
          ? selectedBundled.skills
          : undefined,
      canCreateTasks: permissions.canCreateTasks,
      canMoveTo: permissions.canMoveTo as any,
      canAssignTo: permissions.canAssignTo,
      // Include heartbeat config from bundled data
      heartbeatEnabled: selectedBundled?.heartbeatEnabled,
      heartbeatIntervalSec: selectedBundled?.heartbeatIntervalSec,
      budgetLimitUsd: budget.totalBudgetLimit ? parseFloat(budget.totalBudgetLimit) : undefined,
      autoPauseThreshold: budget.autoPauseThreshold ? parseInt(budget.autoPauseThreshold, 10) : undefined,
    });

    onCreated(identity.slug);
  }

  const steps = [
    {
      label: "Template",
      content: (
        <TemplateStep
          selected={selectedTemplate}
          onSelect={handleTemplateSelect}
        />
      ),
    },
    {
      label: "Identity",
      content: <IdentityStep data={identity} onChange={setIdentity} />,
    },
    {
      label: "Permissions",
      content: (
        <PermissionsStep
          data={permissions}
          agentIds={existingAgents?.map((a) => a.id) ?? []}
          onChange={setPermissions}
        />
      ),
    },
    {
      label: "Budget",
      content: <BudgetStep data={budget} onChange={setBudget} />,
    },
  ];

  return (
    <WizardStepper
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onComplete={handleCreate}
      completeLabel="Create Agent"
    />
  );
}
