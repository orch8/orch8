import { Link, useRouterState } from "@tanstack/react-router";
import { useUiStore } from "../../stores/ui.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { NotificationBell } from "./NotificationBell.js";
import { useParams } from "@tanstack/react-router";

interface NavItem {
  to: string;
  label: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function useProjectSections(): NavSection[] {
  const params = useParams({ strict: false }) as { projectId?: string };
  const projectId = params.projectId;
  const prefix = projectId ? `/projects/${projectId}` : "";

  return [
    {
      title: "WORK",
      items: [
        { to: `${prefix}/board`, label: "Board" },
        { to: `${prefix}/brainstorm`, label: "Brainstorm" },
      ],
    },
    {
      title: "SETUP",
      items: [
        { to: `${prefix}/agents`, label: "Agents" },
        { to: `${prefix}/settings`, label: "Settings" },
      ],
    },
    {
      title: "MONITOR",
      items: [
        { to: `${prefix}/runs`, label: "Runs" },
        { to: `${prefix}/cost`, label: "Cost" },
        { to: `${prefix}/memory`, label: "Memory" },
        { to: `${prefix}/activity`, label: "Activity" },
      ],
    },
    {
      title: "SYSTEM",
      items: [
        { to: "/daemon", label: "Daemon" },
      ],
    },
  ];
}

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const params = useParams({ strict: false }) as { projectId?: string };
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const sections = useProjectSections();

  if (!sidebarOpen) return null;

  function isActive(to: string) {
    if (to === "/") return pathname === "/";
    return pathname.startsWith(to);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Project Switcher */}
      <div className="border-b border-zinc-800 p-4">
        <ProjectSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {/* Home */}
        <Link
          to={(params.projectId ? `/projects/${params.projectId}` : "/") as any}
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname === "/" || pathname === `/projects/${params.projectId}`
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          Home
        </Link>

        {/* Sections */}
        {sections.map((section) => (
          <div key={section.title} className="mt-3">
            <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              {section.title}
            </span>
            <div className="mt-1 flex flex-col gap-0.5">
              {section.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to as any}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive(item.to)
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          {params.projectId ? (
            <NotificationBell projectId={params.projectId} />
          ) : (
            <span />
          )}
          <span className="text-[10px] text-zinc-600">orch8</span>
        </div>
      </div>
    </aside>
  );
}
