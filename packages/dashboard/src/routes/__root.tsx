import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/layout/Sidebar.js";
import { useUiStore } from "../stores/ui.js";
import { useWsEvents } from "../hooks/useWsEvents.js";

function RootLayout() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { connected } = useWsEvents();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 5h14M3 10h14M3 15h14"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold">orch8</h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-red-500"}`}
            />
            <span className="text-xs text-zinc-500">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
