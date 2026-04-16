// packages/dashboard/src/components/onboarding/WelcomeWizard.tsx
import { useState } from "react";
import { WizardStepper } from "../shared/WizardStepper.js";
import { FormField } from "../shared/FormField.js";
import { TemplateStep } from "../agent-editor/TemplateStep.js";
import { useCreateProject } from "../../hooks/useProjects.js";
import { useAddBundledAgents } from "../../hooks/useBundledAgents.js";
import { useCreateTask } from "../../hooks/useTasks.js";
import { useCreateChat } from "../../hooks/useChats.js";

interface WelcomeWizardProps {
  onComplete: (projectId: string) => void;
  /** Navigate to chat after conversational setup. */
  onChatNavigate: (projectId: string, chatId: string) => void;
  /** Show the intro "Welcome" step (defaults to true). */
  showIntro?: boolean;
}

export function WelcomeWizard({ onComplete, onChatNavigate, showIntro = true }: WelcomeWizardProps) {
  const [step, setStep] = useState(0);
  const createProject = useCreateProject();
  const addBundledAgents = useAddBundledAgents();
  const createTask = useCreateTask();
  const createChat = useCreateChat();

  // Project fields
  const [projectName, setProjectName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("main");
  const [dailyBudget, setDailyBudget] = useState("");

  // Setup path: null until chosen, then "manual" or "conversational"
  const [setupPath, setSetupPath] = useState<"manual" | "conversational" | null>(null);

  // Selected bundled agents (multi-select) — manual path only
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  // First task — manual path only
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

  function selectPath(path: "manual" | "conversational") {
    setSetupPath(path);
    setStep(step + 1);
  }

  const setupStepIndex = showIntro ? 1 : 0;

  function handleStepChange(newStep: number) {
    // Prevent advancing past the Setup step without choosing a path
    if (step === setupStepIndex && newStep > step && setupPath === null) {
      return;
    }
    setStep(newStep);
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
                  orch8 orchestrates AI agents to work on your codebase. Create a project,
                  configure agents, and let them handle tasks autonomously.
                </p>
              </div>
            ),
          },
        ]
      : []),
    {
      label: "Setup",
      content: (
        <div className="flex flex-col items-center gap-6 py-8">
          <h2 className="type-title font-bold text-zinc-100">How would you like to get started?</h2>
          <p className="max-w-md text-center text-sm text-zinc-400">
            Choose how you'd like to set up your project.
          </p>
          <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
            <button
              type="button"
              onClick={() => selectPath("manual")}
              className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-left hover:border-zinc-500 transition-colors"
            >
              <h3 className="font-semibold text-zinc-100">I know what I need</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Pick agents and create your first task manually.
              </p>
            </button>
            <button
              type="button"
              onClick={() => selectPath("conversational")}
              className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-left hover:border-zinc-500 transition-colors"
            >
              <h3 className="font-semibold text-zinc-100">Help me set up</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Describe what you're building and I'll design a team for you.
              </p>
            </button>
          </div>
        </div>
      ),
    },
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
      label: "Settings",
      content: (
        <div className="flex flex-col gap-4">
          <h3 className="type-section font-semibold text-zinc-100">Review Settings</h3>
          <p className="text-xs text-zinc-500">These can be changed later in Settings.</p>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-300">
            <div className="flex justify-between py-1"><span>Model</span><span>claude-opus-4-7</span></div>
            <div className="flex justify-between py-1"><span>Verification Required</span><span>Yes</span></div>
            <div className="flex justify-between py-1"><span>Max Concurrent Agents</span><span>5</span></div>
            <div className="flex justify-between py-1"><span>Tick Interval</span><span>5000ms</span></div>
          </div>
          {setupPath === "conversational" && error && (
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
    ...(setupPath !== "conversational"
      ? [
          {
            label: "Agents",
            content: (
              <div className="flex flex-col gap-4">
                <h3 className="type-section font-semibold text-zinc-100">Add Agents</h3>
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
        ]
      : []),
  ];

  const SEED_MESSAGE =
    "Hi! Tell me what you're building and who it's for. " +
    "I'll ask a few questions, then propose a team of AI agents and a roadmap " +
    "of epics for them to work on. Once you approve, the agents get to work.";

  async function handleComplete() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    // ── Create project (both paths) ────────────────────────
    const slug = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    let project: { id: string };
    try {
      project = await createProject.mutateAsync({
        name: projectName,
        slug,
        description: "",
        homeDir: repoPath,
        worktreeDir: `${repoPath}/.worktrees`,
        defaultBranch,
        budgetLimitUsd: dailyBudget ? parseFloat(dailyBudget) : undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
      setSubmitting(false);
      return;
    }

    // ── Conversational path: create chat with seed message ─
    if (setupPath === "conversational") {
      try {
        const chat = await createChat.mutateAsync({
          projectId: project.id,
          title: "Project Setup",
          seedMessage: SEED_MESSAGE,
        });
        setSubmitting(false);
        onChatNavigate(project.id, chat.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create chat");
        setSubmitting(false);
      }
      return;
    }

    // ── Manual path: agents + first task (existing flow) ───
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
    onComplete(project.id);
  }

  return (
    <WizardStepper
      steps={steps}
      currentStep={step}
      onStepChange={handleStepChange}
      onComplete={handleComplete}
      completeLabel="Finish Setup"
    />
  );
}
