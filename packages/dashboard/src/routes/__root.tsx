import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/layout/Sidebar.js";
import { TopBar } from "../components/layout/TopBar.js";
import { ToastContainer } from "../components/notifications/ToastContainer.js";
import { WsEventsProvider } from "../hooks/WsEventsProvider.js";

function RootLayout() {
  // WsEventsProvider scopes the /ws connection to the current project via router state.
  return (
    <WsEventsProvider>
      <div className="flex h-screen bg-canvas text-ink">
        <ToastContainer />
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
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
