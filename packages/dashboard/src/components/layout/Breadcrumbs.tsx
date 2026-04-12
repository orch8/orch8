import { Link, useRouterState } from "@tanstack/react-router";

const SEGMENT_LABELS: Record<string, string> = {
  board: "Board",
  chat: "Chat",
  agents: "Agents",
  runs: "Runs",
  cost: "Cost",
  memory: "Memory",
  activity: "Activity",
  settings: "Settings",
  pipelines: "Pipelines",
  tasks: "Tasks",
  daemon: "Daemon",
  new: "New",
  briefing: "Briefing",
};

// Segments that are path prefixes without their own route.
// Map them to a sibling route the user should land on instead.
const SEGMENT_REWRITE: Record<string, string> = {
  tasks: "board",
};

function labelFor(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment;
}

interface BreadcrumbsProps {
  compact?: boolean;
}

export function Breadcrumbs({ compact = false }: BreadcrumbsProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);

  if (compact) {
    // Show only the current (last meaningful) segment.
    const lastPart = [...parts].reverse().find((p) => p !== "projects") ?? "";
    return (
      <nav aria-label="Breadcrumb" className="flex items-center">
        <span className="type-ui text-ink">{labelFor(lastPart)}</span>
      </nav>
    );
  }

  // Full breadcrumbs (desktop behavior — unchanged).
  const crumbs: Array<{ label: string; to: string; isCurrent: boolean }> = [
    { label: "orch8", to: "/", isCurrent: parts.length === 0 },
  ];

  let acc = "";
  parts.forEach((part, i) => {
    acc += `/${part}`;
    if (part === "projects") return;

    // Rewrite prefix-only segments to a sibling route that actually exists.
    const rewrite = SEGMENT_REWRITE[part];
    const to = rewrite ? acc.replace(/\/[^/]+$/, `/${rewrite}`) : acc;

    crumbs.push({
      label: labelFor(part),
      to,
      isCurrent: i === parts.length - 1,
    });
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2">
      {crumbs.map((crumb, i) => (
        <span key={crumb.to} className="flex items-center gap-2">
          {i > 0 && (
            <span className="type-mono text-whisper" aria-hidden>
              /
            </span>
          )}
          {crumb.isCurrent ? (
            <span className="type-ui text-ink">{crumb.label}</span>
          ) : (
            <Link
              to={crumb.to as any}
              className="focus-ring type-ui text-mute hover:text-ink"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
