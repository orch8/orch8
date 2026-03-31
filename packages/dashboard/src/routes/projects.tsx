import { createFileRoute, Outlet } from "@tanstack/react-router";

function ProjectsLayout() {
  return (
    <div className="h-full">
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/projects")({
  component: ProjectsLayout,
});
