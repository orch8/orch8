import { createFileRoute, Outlet } from "@tanstack/react-router";

function AgentsLayout() {
  return (
    <div className="h-full">
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute("/agents")({
  component: AgentsLayout,
});
