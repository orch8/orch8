import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <div>
      <p className="text-zinc-400">Dashboard ready. Waiting for features from specs 02-14.</p>
    </div>
  ),
});
