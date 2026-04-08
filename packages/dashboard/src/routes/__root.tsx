import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/layout/Sidebar.js";
import { ToastContainer } from "../components/notifications/ToastContainer.js";
import { WsEventsProvider } from "../hooks/WsEventsProvider.js";
import { useUiStore } from "../stores/ui.js";

function RootLayout() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // WsEventsProvider is mounted here (inside the RouterProvider) rather than
  // in main.tsx so it can read the current projectId from the router state and
  // scope the /ws connection to one project at a time.
  return (
    <WsEventsProvider>
      <div className="flex h-screen bg-zinc-950 text-zinc-100">
        <ToastContainer />
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-zinc-800 px-6 py-3">
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
          </header>
          <main className="flex-1 overflow-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </WsEventsProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
