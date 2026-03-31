import { createFileRoute } from "@tanstack/react-router";

function BrainstormListPage() {
  return (
    <div className="h-full">
      <h2 className="mb-4 text-lg font-semibold">Brainstorm Sessions</h2>
      <p className="text-sm text-zinc-500">Coming soon — see Plan 4: Work Hub.</p>
    </div>
  );
}

export const Route = createFileRoute("/brainstorm/")({
  component: BrainstormListPage,
});
