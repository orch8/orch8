// packages/dashboard/src/components/agent-editor/AgentWizard.tsx
import { useState } from "react";
import { WizardStepper } from "../shared/WizardStepper.js";
import { TemplateStep } from "./TemplateStep.js";
import { IdentityStep, type IdentityData } from "./IdentityStep.js";
import { PromptsStep, type PromptsData } from "./PromptsStep.js";
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
    model: "claude-opus-4-6",
    effort: "medium",
    maxTurns: 25,
  });
  const [prompts, setPrompts] = useState<PromptsData>({
    instructionsFilePath: "",
    systemPrompt: "",
    promptTemplate: "",
    bootstrapPromptTemplate: "",
    skillPaths: [],
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

    // Pre-fill ALL prompt fields from bundled data
    setPrompts({
      instructionsFilePath: "",
      systemPrompt: agent.systemPrompt ?? "",
      promptTemplate: agent.promptTemplate ?? "",
      bootstrapPromptTemplate: agent.bootstrapPromptTemplate ?? "",
      skillPaths: agent.skills ?? [],
    });

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
      instructionsFilePath: prompts.instructionsFilePath || undefined,
      systemPrompt: prompts.systemPrompt || undefined,
      promptTemplate: prompts.promptTemplate || undefined,
      bootstrapPromptTemplate: prompts.bootstrapPromptTemplate || undefined,
      skillPaths: prompts.skillPaths.length > 0 ? prompts.skillPaths : undefined,
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
      label: "Prompts",
      content: <PromptsStep data={prompts} onChange={setPrompts} />,
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
