import type { ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { Breadcrumbs } from "./Breadcrumbs.js";
import { NotificationBell } from "./NotificationBell.js";
import { SidebarTrigger } from "../ui/Sidebar.js";

interface TopBarProps {
  primaryAction?: ReactNode;
}

export function TopBar({ primaryAction }: TopBarProps) {
  const params = useParams({ strict: false }) as { projectSlug?: string };

  return (
    <header className="flex h-[var(--size-topbar-height)] shrink-0 items-center justify-between gap-4 border-b border-edge-soft bg-background px-[var(--pad-page)]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="shrink-0" />
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search... ⌘K"
          className="focus-ring hidden h-8 w-52 rounded-sm border border-edge bg-surface px-3 type-ui text-ink placeholder:text-whisper md:block"
        />
        {primaryAction}
        {params.projectSlug ? <NotificationBell projectId={params.projectSlug} /> : null}
      </div>
    </header>
  );
}
