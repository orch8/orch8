import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";

export const Route = createFileRoute("/projects/new")({
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl p-[var(--gap-section)]">
      <WelcomeWizard
        showIntro={false}
        onComplete={(projectId) =>
          navigate({ to: "/projects/$projectId", params: { projectId } })
        }
        onChatNavigate={(projectId, chatId) =>
          navigate({
            to: "/projects/$projectId/chat/$chatId",
            params: { projectId, chatId },
          })
        }
      />
    </div>
  );
}
