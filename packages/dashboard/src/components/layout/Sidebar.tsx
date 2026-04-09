import { Link, useRouterState, useParams } from "@tanstack/react-router";
import { useDaemonStatus } from "../../hooks/useDaemon.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { NotificationBell } from "./NotificationBell.js";

interface NavItem {
  to: string;
  label: string;
  count?: number;
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
        { to: `${prefix}/pipelines`, label: "Pipelines" },
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
  ];
}

function navItemClass(active: boolean): string {
  // 2px left stripe carries active state. No rounded-pill background.
  const base =
    "focus-ring relative flex items-center justify-between pl-3 pr-3 py-1.5 type-ui transition-colors";
  return active
    ? `${base} bg-surface text-ink before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-accent`
    : `${base} text-mute hover:bg-surface-2 hover:text-ink`;
}

interface SidebarProps {
  onClose?: () => void;
}

export function Sidebar({ onClose }: SidebarProps = {}) {
  const params = useParams({ strict: false }) as { projectId?: string };
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });
  const sections = useProjectSections();
  const { data: daemonStatus } = useDaemonStatus();

  function isActive(to: string) {
    if (to === "/") return pathname === "/";
    return pathname.startsWith(to);
  }

  return (
    <aside className="flex w-52 shrink-0 flex-col border-r border-edge-soft bg-sidebar">
      {/* Project Switcher */}
      <div className="border-b border-edge-soft p-4">
        <ProjectSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        {/* Chat + Briefing — top of nav, no group label, no glyph.
            Chat is the project landing (routes/$projectId/index.tsx still
            redirects to /chat). Briefing is a separate destination below it. */}
        {params.projectId && (
          <>
            <Link
              to={`/projects/${params.projectId}/chat` as any}
              className={navItemClass(
                pathname.startsWith(`/projects/${params.projectId}/chat`),
              )}
            >
              <span>Chat</span>
            </Link>
            <Link
              to={`/projects/${params.projectId}/briefing` as any}
              className={navItemClass(
                pathname.startsWith(`/projects/${params.projectId}/briefing`),
              )}
            >
              <span>Briefing</span>
            </Link>
          </>
        )}

        {/* Grouped sections */}
        {sections.map((section) => (
          <div key={section.title} className="mt-5">
            <span className="px-3 type-label text-whisper">{section.title}</span>
            <div className="mt-1 flex flex-col">
              {section.items.map((item) => (
                <Link
                  key={item.to}
                  to={item.to as any}
                  className={navItemClass(isActive(item.to))}
                >
                  <span>{item.label}</span>
                  {item.count != null && (
                    <span className="type-mono text-whisper">{item.count}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: daemon link (sage pulse) + notification bell */}
      <div className="border-t border-edge-soft px-3 py-3">
        <div className="flex items-center justify-between">
          <Link
            to={"/daemon" as any}
            className="focus-ring flex items-center gap-2 text-mute hover:text-ink"
          >
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
            />
            <span className="type-mono">
              daemon{daemonStatus?.uptimeFormatted ? ` ${daemonStatus.uptimeFormatted}` : ""}
            </span>
          </Link>
          {params.projectId ? (
            <NotificationBell projectId={params.projectId} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
