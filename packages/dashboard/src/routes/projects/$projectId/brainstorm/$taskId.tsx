import { createFileRoute } from "@tanstack/react-router";
import { BrainstormChat } from "../../../../components/brainstorm/BrainstormChat.js";

function BrainstormPage() {
  const { taskId } = Route.useParams();

  return (
    <div className="h-full">
      <BrainstormChat taskId={taskId} />
    </div>
  );
}

export const Route = createFileRoute("/projects/$projectId/brainstorm/$taskId")({
  component: BrainstormPage,
});
