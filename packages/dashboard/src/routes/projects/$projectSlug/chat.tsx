import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ChatLayout } from "../../../components/chat/ChatLayout.js";

function ChatRouteLayout() {
  const { projectSlug: projectId } = Route.useParams();
  return (
    <ChatLayout projectId={projectId}>
      <Outlet />
    </ChatLayout>
  );
}

export const Route = createFileRoute("/projects/$projectSlug/chat")({
  component: ChatRouteLayout,
});
