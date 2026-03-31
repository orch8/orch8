import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WelcomeWizard } from "../components/onboarding/WelcomeWizard.js";

function WelcomePage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-2xl py-12">
      <WelcomeWizard onComplete={() => navigate({ to: "/" })} />
    </div>
  );
}

export const Route = createFileRoute("/welcome")({
  component: WelcomePage,
});
