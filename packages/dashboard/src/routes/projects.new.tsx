import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";
import { RepositoryStart } from "../components/onboarding/RepositoryStart.js";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return <div className="mx-auto max-w-2xl space-y-4 p-[var(--gap-section)]">
    {showAdvanced ? <WelcomeWizard
      showIntro={false}
      onComplete={projectSlug => void navigate({ to: "/projects/$projectSlug/pipelines", params: { projectSlug } })}
    /> : <RepositoryStart
      onComplete={projectSlug => void navigate({ to: "/projects/$projectSlug/pipelines", params: { projectSlug } })}
    />}
    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-blue-300 underline">
      {showAdvanced ? "Back to quick repository setup" : "Use project setup with agents and a starter task"}
    </button>
  </div>;
}
