import type { ReactNode } from "react";
import { ChatThreadList } from "./ChatThreadList.js";

interface ChatLayoutProps {
  projectId: string;
  children: ReactNode;
}

export function ChatLayout({ projectId, children }: ChatLayoutProps) {
  return (
    <div className="flex h-full bg-canvas text-ink">
      <ChatThreadList projectId={projectId} />
      <div className="flex h-full flex-1 flex-col">{children}</div>
    </div>
  );
}
