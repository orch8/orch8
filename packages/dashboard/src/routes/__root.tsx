import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "../components/layout/Sidebar.js";
import { TopBar } from "../components/layout/TopBar.js";
import { Drawer } from "../components/ui/Drawer.js";
import { ToastContainer } from "../components/notifications/ToastContainer.js";
import { WsEventsProvider } from "../hooks/WsEventsProvider.js";
import { useBreakpoint } from "../hooks/useBreakpoint.js";
import { useUiStore } from "../stores/ui.js";

function RootLayout() {
  const { isNarrow } = useBreakpoint();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const activeDrawer = useUiStore((s) => s.activeDrawer);
  const openDrawer = useUiStore((s) => s.openDrawer);
  const closeDrawer = useUiStore((s) => s.closeDrawer);

  return (
    <WsEventsProvider>
      <div className="flex h-screen bg-canvas text-ink">
        <ToastContainer />

        {isNarrow ? (
          <Drawer
            open={activeDrawer === "sidebar"}
            onClose={closeDrawer}
          >
            <Sidebar onClose={closeDrawer} />
          </Drawer>
        ) : (
          sidebarOpen && <Sidebar />
        )}

        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            onHamburgerClick={
              isNarrow ? () => openDrawer("sidebar") : undefined
            }
          />
          <main className="flex-1 overflow-auto p-[var(--pad-page)]">
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
