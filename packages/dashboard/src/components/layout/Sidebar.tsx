import { Link, useRouterState } from "@tanstack/react-router";
import { useUiStore } from "../../stores/ui.js";
import { ProjectSwitcher } from "./ProjectSwitcher.js";

const NAV_ITEMS = [
  { to: "/", label: "Board" },
  { to: "/agents", label: "Agents" },
  { to: "/runs", label: "Runs" },
  { to: "/memory", label: "Memory" },
  { to: "/cost", label: "Costs" },
] as const;

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  if (!sidebarOpen) return null;

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-4">
        <ProjectSwitcher />
      </div>
      <nav className="flex flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active = item.to === "/"
            ? pathname === "/"
            : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
