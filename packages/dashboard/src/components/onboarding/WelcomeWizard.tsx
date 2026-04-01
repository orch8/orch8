// packages/dashboard/src/components/onboarding/WelcomeWizard.tsx
import { useState } from "react";
import { WizardStepper } from "../shared/WizardStepper.js";
import { FormField } from "../shared/FormField.js";
import { TemplateStep } from "../agent-editor/TemplateStep.js";
import { useCreateProject } from "../../hooks/useProjects.js";
import { useAddBundledAgents } from "../../hooks/useBundledAgents.js";
import { useCreateTask } from "../../hooks/useTasks.js";

interface WelcomeWizardProps {
  onComplete: (projectId: string) => void;
}

export function WelcomeWizard({ onComplete }: WelcomeWizardProps) {
  const [step, setStep] = useState(0);
  const createProject = useCreateProject();
  const addBundledAgents = useAddBundledAgents();
  const createTask = useCreateTask();
  // Project fields
  const [projectName, setProjectName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [dailyBudget, setDailyBudget] = useState("");

  // Selected bundled agents (multi-select)
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // First task
  const [taskTitle, setTaskTitle] = useState("");

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId],
    );
  }

  const steps = [
    {
      label: "Welcome",
      content: (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <h2 className="text-2xl font-bold text-zinc-100">Welcome to orch8</h2>
          <p className="max-w-md text-sm text-zinc-400">
            orch8 orchestrates AI agents to work on your codebase. Create a project,
            configure agents, and let them handle tasks autonomously.
          </p>
        </div>
      ),
    },
    {
      label: "Project",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-100">Create Project</h3>
          <FormField label="Project Name" required>
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="My App"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>
          <FormField label="Repository Path" required description="Absolute path to your git repository">
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/path/to/your/repo"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>
          <FormField label="Default Branch">
            <input
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>
          <FormField label="Daily Budget Limit ($)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              placeholder="No limit"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>
        </div>
      ),
    },
    {
      label: "Settings",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-100">Review Settings</h3>
          <p className="text-xs text-zinc-500">These can be changed later in Settings.</p>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
            <div className="flex justify-between py-1"><span>Model</span><span>claude-opus-4-6</span></div>
            <div className="flex justify-between py-1"><span>Verification Required</span><span>Yes</span></div>
            <div className="flex justify-between py-1"><span>Max Concurrent Agents</span><span>5</span></div>
            <div className="flex justify-between py-1"><span>Tick Interval</span><span>5000ms</span></div>
          </div>
        </div>
      ),
    },
    {
      label: "Agents",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-100">Add Agents</h3>
          <p className="text-xs text-zinc-500">
            Select agents to add to your project. You can skip this and add agents later.
          </p>
          <TemplateStep
            mode="multi"
            selected={selectedAgentIds}
            onToggle={toggleAgent}
          />
        </div>
      ),
    },
    {
      label: "First Task",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold text-zinc-100">Create Your First Task</h3>
          <FormField label="Task Title" description="Or skip this — you can create tasks from the Board later.">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Build the authentication flow"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>
        </div>
      ),
    },
  ];

  async function handleComplete() {
    // Create project
    const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const project = await createProject.mutateAsync({
      name: projectName,
      slug,
      description: "",
      homeDir: repoPath,
      worktreeDir: `${repoPath}/.worktrees`,
      defaultBranch,
      budgetLimitUsd: dailyBudget ? parseFloat(dailyBudget) : undefined,
    });

    // Batch-create selected bundled agents
    if (selectedAgentIds.length > 0) {
      try {
        await addBundledAgents.mutateAsync({
          projectId: project.id,
          agentIds: selectedAgentIds,
        });
      } catch {
        // Agent creation failure should not block wizard completion
      }
    }

    // Create task if title given
    if (taskTitle.trim()) {
      try {
        await createTask.mutateAsync({
          projectId: project.id,
          title: taskTitle.trim(),
          taskType: "quick",
          priority: "medium",
        } as any);
      } catch {
        // Task creation failure should not block wizard completion
      }
    }

    onComplete(project.id);
  }

  return (
    <WizardStepper
      steps={steps}
      currentStep={step}
      onStepChange={setStep}
      onComplete={handleComplete}
      completeLabel="Finish Setup"
    />
  );
}
