import { Link, useRouterState, useParams } from "@tanstack/react-router";
import type { ComponentProps, ComponentType } from "react";
import {
  ActivityIcon,
  BotIcon,
  BriefcaseBusinessIcon,
  CircleDollarSignIcon,
  ClipboardListIcon,
  CpuIcon,
  GitBranchIcon,
  MessageSquareTextIcon,
  RadioIcon,
  SettingsIcon,
} from "lucide-react";
import { useDaemonStatus } from "../../hooks/useDaemon.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";
import { NotificationBell } from "./NotificationBell.js";
import {
  Sidebar as SidebarPrimitive,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "../ui/Sidebar.js";

// Sidebar builds target routes at runtime by concatenating the active projectId
// (e.g. `/projects/${id}/board`). TanStack Router's Link component checks the
// `to` prop against the generated route-tree literal type, which cannot match a
// template string at compile time. We widen to the prop type rather than `any`
// so the rest of the Link API still benefits from inference.
// TODO: Revisit once TanStack Router supports typed builders for runtime paths.
type LinkTo = ComponentProps<typeof Link>["to"];

interface NavItem {
  to: string;
  label: string;
  count?: number;
  icon: ComponentType<{ className?: string }>;
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
        { to: `${prefix}/board`, label: "Board", icon: ClipboardListIcon },
        { to: `${prefix}/pipelines`, label: "Pipelines", icon: GitBranchIcon },
      ],
    },
    {
      title: "SETUP",
      items: [
        { to: `${prefix}/agents`, label: "Agents", icon: BotIcon },
        { to: `${prefix}/settings`, label: "Settings", icon: SettingsIcon },
      ],
    },
    {
      title: "MONITOR",
      items: [
        { to: `${prefix}/runs`, label: "Runs", icon: RadioIcon },
        { to: `${prefix}/cost`, label: "Cost", icon: CircleDollarSignIcon },
        { to: `${prefix}/memory`, label: "Memory", icon: CpuIcon },
        { to: `${prefix}/activity`, label: "Activity", icon: ActivityIcon },
      ],
    },
  ];
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
  const { state } = useSidebar();

  function isActive(to: string) {
    if (to === "/") return pathname === "/";
    return pathname.startsWith(to);
  }

  return (
    <SidebarPrimitive collapsible="icon">
      <div className="border-b border-edge-soft p-3 group-data-[collapsible=icon]:p-2">
        <ProjectSwitcher />
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        {params.projectId && (
          <SidebarGroup>
            <SidebarMenu>
              <NavLink
                active={pathname.startsWith(`/projects/${params.projectId}/chat`)}
                icon={MessageSquareTextIcon}
                label="Chat"
                onClose={onClose}
                to={`/projects/${params.projectId}/chat`}
              />
              <NavLink
                active={pathname.startsWith(`/projects/${params.projectId}/briefing`)}
                icon={BriefcaseBusinessIcon}
                label="Briefing"
                onClose={onClose}
                to={`/projects/${params.projectId}/briefing`}
              />
            </SidebarMenu>
          </SidebarGroup>
        )}

        {sections.map((section) => (
          <SidebarGroup key={section.title} className="mt-2">
            <span className="px-2 type-label text-whisper group-data-[collapsible=icon]:sr-only">
              {section.title}
            </span>
            <SidebarMenu className="mt-1">
              {section.items.map((item) => (
                <NavLink
                  active={isActive(item.to)}
                  count={item.count}
                  icon={item.icon}
                  key={item.to}
                  label={item.label}
                  onClose={onClose}
                  to={item.to as LinkTo}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </nav>

      <div className="border-t border-edge-soft p-2">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <SidebarMenuButton
            render={<Link to="/daemon" />}
            tooltip="Daemon"
          >
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="type-mono truncate">
              daemon{daemonStatus?.uptimeFormatted ? ` ${daemonStatus.uptimeFormatted}` : ""}
            </span>
          </SidebarMenuButton>
          {params.projectId && state !== "collapsed" ? (
            <NotificationBell projectId={params.projectId} />
          ) : null}
        </div>
      </div>
      <SidebarRail />
    </SidebarPrimitive>
  );
}

function NavLink({
  active,
  count,
  icon: Icon,
  label,
  onClose,
  to,
}: {
  active: boolean;
  count?: number;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClose?: () => void;
  to: LinkTo;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={onClose}
        render={<Link to={to} />}
        tooltip={label}
      >
        <Icon />
        <span>{label}</span>
        {count != null && <span className="ml-auto type-mono text-whisper">{count}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
