import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "../api/client.js";

const STORAGE_KEY = "orch8:lastProjectId";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const lastProjectId = localStorage.getItem(STORAGE_KEY);

    if (lastProjectId) {
      throw redirect({ to: "/projects/$projectId", params: { projectId: lastProjectId } });
    }

    // No last project — check if any projects exist
    try {
      const projects = await api.get<Array<{ id: string }>>("/projects");
      if (projects.length > 0) {
        throw redirect({ to: "/projects/$projectId", params: { projectId: projects[0].id } });
      }
    } catch (e) {
      if ((e as any)?.isRedirect) throw e;
      // API error — fall through to welcome
    }

    throw redirect({ to: "/welcome" });
  },
});
