import { createFileRoute, Outlet } from "@tanstack/react-router";

function SkillsLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/projects/$projectSlug/skills")({
  component: SkillsLayout,
});
