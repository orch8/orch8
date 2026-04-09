import type { ReactNode } from "react";
import { ChatThreadList } from "./ChatThreadList.js";
import { Drawer } from "../ui/Drawer.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { useUiStore } from "../../stores/ui.js";

interface ChatLayoutProps {
  projectId: string;
  children: ReactNode;
}

export function ChatLayout({ projectId, children }: ChatLayoutProps) {
  const { isNarrow } = useBreakpoint();
  const activeDrawer = useUiStore((s) => s.activeDrawer);
  const closeDrawer = useUiStore((s) => s.closeDrawer);

  return (
    <div className="flex h-full bg-canvas text-ink">
      {isNarrow ? (
        <Drawer
          open={activeDrawer === "threads"}
          onClose={closeDrawer}
          side="left"
        >
          <ChatThreadList projectId={projectId} />
        </Drawer>
      ) : (
        <ChatThreadList projectId={projectId} />
      )}
      <div className="flex h-full flex-1 flex-col">{children}</div>
    </div>
  );
}
