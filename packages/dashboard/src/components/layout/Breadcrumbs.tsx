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
};

function labelFor(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment;
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const parts = pathname.split("/").filter(Boolean);

  // Always start with the orch8 root
  const crumbs: Array<{ label: string; to: string; isCurrent: boolean }> = [
    { label: "orch8", to: "/", isCurrent: parts.length === 0 },
  ];

  let acc = "";
  parts.forEach((part, i) => {
    acc += `/${part}`;
    // Skip the literal "projects" segment — "orch8" already represents the root.
    if (part === "projects") return;
    crumbs.push({
      label: labelFor(part),
      to: acc,
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
