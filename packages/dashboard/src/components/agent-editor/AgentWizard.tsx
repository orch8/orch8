import { useState } from "react";
import { WizardStepper } from "../shared/WizardStepper.js";
import { TemplateStep, type AgentTemplate, AGENT_TEMPLATES } from "./TemplateStep.js";
import { IdentityStep, type IdentityData } from "./IdentityStep.js";
import { PromptsStep, type PromptsData } from "./PromptsStep.js";
import { PermissionsStep, type PermissionsData } from "./PermissionsStep.js";
import { BudgetStep, type BudgetData } from "./BudgetStep.js";
import { useCreateAgent, useAgents } from "../../hooks/useAgents.js";

interface AgentWizardProps {
  projectId: string;
  onCreated: (agentId: string) => void;
}

export function AgentWizard({ projectId, onCreated }: AgentWizardProps) {
  const [step, setStep] = useState(0);
  const createAgent = useCreateAgent();
  const { data: existingAgents } = useAgents(projectId);

  // Wizard state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
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
    canComment: true,
    canAccessMemory: true,
  });
  const [budget, setBudget] = useState<BudgetData>({
    dailyBudgetLimit: "",
    totalBudgetLimit: "",
    autoPauseThreshold: "90",
  });

  function handleTemplateSelect(template: AgentTemplate) {
    setSelectedTemplate(template.key);
    // Pre-fill from template
    setIdentity((prev) => ({
      ...prev,
      model: template.defaults.model,
    }));
    setPrompts((prev) => ({
      ...prev,
      systemPrompt: template.defaults.systemPrompt,
    }));
    setPermissions((prev) => ({
      ...prev,
      canCreateTasks: template.defaults.canCreateTasks,
      canMoveTo: template.defaults.canMoveTo,
    }));
  }

  async function handleCreate() {
    const selectedTemplateObj = AGENT_TEMPLATES.find((t) => t.key === selectedTemplate);

    await createAgent.mutateAsync({
      id: identity.slug,
      projectId,
      name: identity.name,
      role: (selectedTemplateObj?.defaults.role ?? "custom") as any,
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
      budgetLimitUsd: budget.totalBudgetLimit ? parseFloat(budget.totalBudgetLimit) : undefined,
    });

    onCreated(identity.slug);
  }

  const steps = [
    {
      label: "Template",
      content: (
        <TemplateStep
          selectedTemplate={selectedTemplate}
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
