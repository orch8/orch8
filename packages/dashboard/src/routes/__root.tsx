import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar as AppSidebar } from "../components/layout/Sidebar.js";
import { TopBar } from "../components/layout/TopBar.js";
import { SidebarInset, SidebarProvider } from "../components/ui/Sidebar.js";
import { ToastContainer } from "../components/notifications/ToastContainer.js";
import { WsEventsProvider } from "../hooks/WsEventsProvider.js";

function RootLayout() {
  return (
    <WsEventsProvider>
      <SidebarProvider>
        <ToastContainer />
        <AppSidebar />
        <SidebarInset>
          <TopBar />
          <main className="flex-1 overflow-auto p-[var(--pad-page)]">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </WsEventsProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
