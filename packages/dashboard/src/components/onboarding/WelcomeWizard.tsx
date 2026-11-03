// packages/dashboard/src/components/onboarding/WelcomeWizard.tsx
import { useState } from "react";
import { WizardStepper } from "../shared/WizardStepper.js";
import { FormField } from "../shared/FormField.js";
import { TemplateStep } from "../agent-editor/TemplateStep.js";
import { useCreateProject } from "../../hooks/useProjects.js";
import { useAddBundledAgents } from "../../hooks/useBundledAgents.js";
import { useCreateTask } from "../../hooks/useTasks.js";

interface WelcomeWizardProps {
  onComplete: (projectSlug: string) => void;
  /** Show the intro "Welcome" step (defaults to true). */
  showIntro?: boolean;
}

export function WelcomeWizard({ onComplete, showIntro = true }: WelcomeWizardProps) {
  const [step, setStep] = useState(0);
  const createProject = useCreateProject();
  const addBundledAgents = useAddBundledAgents();
  const createTask = useCreateTask();

  // Project fields
  const [projectName, setProjectName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [dailyBudget, setDailyBudget] = useState("");

  // Optional task-driven agents
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // Optional first task
  const [taskTitle, setTaskTitle] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleAgent(agentId: string) {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId],
    );
  }

  const steps = [
    ...(showIntro
      ? [
          {
            label: "Welcome",
            content: (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <h2 className="type-title font-bold text-zinc-100">Welcome to orch8</h2>
                <p className="max-w-md text-sm text-zinc-400">
                  Choose a repository and define explicit tasks. Configure agents when
                  you are ready to work on your codebase.
                </p>
              </div>
            ),
          },
        ]
      : []),
    {
      label: "Project",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="type-section font-semibold text-zinc-100">Create Project</h3>
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
      label: "Agents",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="type-section font-semibold text-zinc-100">Add Agents</h3>
          <p className="text-xs text-zinc-500">
            Optionally add task-driven agents. You can configure more agents later under Agents.
          </p>
          <TemplateStep
            mode="multi"
            allowedIds={["implementer", "reviewer"]}
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
          <h3 className="type-section font-semibold text-zinc-100">Create Your First Task</h3>
          <FormField label="Task Title" description="Or skip this — you can create tasks from the Board later.">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Build the authentication flow"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </FormField>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </div>
          )}
        </div>
      ),
    },
  ];

  async function handleComplete() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    // Create the project before adding optional agents and a task.
    const slug = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let project: { id: string; slug: string };
    try {
      project = await createProject.mutateAsync({
        name: projectName,
        slug,
        description: "",
        homeDir: repoPath,
        defaultBranch,
        budgetLimitUsd: dailyBudget ? parseFloat(dailyBudget) : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
      setSubmitting(false);
      return;
    }

    if (selectedAgentIds.length > 0) {
      try {
        await addBundledAgents.mutateAsync({
          projectId: project.id,
          agentIds: selectedAgentIds,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add agents");
        setSubmitting(false);
        return;
      }
    }

    if (taskTitle.trim()) {
      try {
        await createTask.mutateAsync({
          projectId: project.id,
          title: taskTitle.trim(),
          taskType: "quick",
          priority: "medium",
        } as any);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create task");
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    onComplete(project.slug);
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
