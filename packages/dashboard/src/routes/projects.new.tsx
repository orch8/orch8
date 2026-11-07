import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";
import { RepositoryStart } from "../components/onboarding/RepositoryStart.js";
import { ExistingRepositories } from "../components/onboarding/ExistingRepositories.js";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const open = (projectSlug: string) => void navigate({ to: "/projects/$projectSlug/pipelines", params: { projectSlug } });

  return <div className="mx-auto max-w-2xl space-y-4 p-[var(--gap-section)]">
    <ExistingRepositories onOpen={open} onResume={(projectSlug, pipelineId) => void navigate({
      to: "/projects/$projectSlug/pipelines/$pipelineId", params: { projectSlug, pipelineId },
    })} />
    {showAdvanced ? <WelcomeWizard
      showIntro={false}
      onComplete={open}
    /> : <RepositoryStart onComplete={open} />}
    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-blue-300 underline">
      {showAdvanced ? "Back to quick repository setup" : "Use project setup with agents and a starter task"}
    </button>
  </div>;
}
