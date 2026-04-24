import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { api } from "../api/client.js";

const STORAGE_KEY = "orch8:lastProjectSlug";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const lastProjectSlug = localStorage.getItem(STORAGE_KEY);

    if (lastProjectSlug) {
      throw redirect({ to: "/projects/$projectSlug", params: { projectSlug: lastProjectSlug } });
    }

    // No last project — check if any projects exist
    try {
      const projects = await api.get<Array<{ slug: string }>>("/projects");
      if (projects.length > 0) {
        throw redirect({ to: "/projects/$projectSlug", params: { projectSlug: projects[0].slug } });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
      // API error — fall through to welcome
    }

    throw redirect({ to: "/welcome" });
  },
});
