import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ChatLayout } from "../../../components/chat/ChatLayout.js";

function ChatRouteLayout() {
  const { projectId } = Route.useParams();
  return (
    <ChatLayout projectId={projectId}>
      <Outlet />
    </ChatLayout>
  );
}

export const Route = createFileRoute("/projects/$projectId/chat")({
  component: ChatRouteLayout,
});
