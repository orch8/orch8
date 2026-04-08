import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/layout/Sidebar.js";
import { ToastContainer } from "../components/notifications/ToastContainer.js";
import { WsEventsProvider } from "../hooks/WsEventsProvider.js";
import { useUiStore } from "../stores/ui.js";

function RootLayout() {
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  // WsEventsProvider is mounted here (inside the RouterProvider) so it can read
  // the current projectId from the router state and scope /ws per project.
  return (
    <WsEventsProvider>
      <div className="flex h-screen bg-canvas text-ink">
        <ToastContainer />
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center gap-3 border-b border-edge-soft px-6 py-3">
            <button
              onClick={toggleSidebar}
              className="focus-ring rounded-sm p-1 text-mute hover:bg-surface-2 hover:text-ink"
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
            <h1 className="type-section">orch8</h1>
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
