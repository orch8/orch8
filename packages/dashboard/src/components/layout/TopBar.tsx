import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs.js";

interface TopBarProps {
  primaryAction?: ReactNode;
}

export function TopBar({ primaryAction }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-edge-soft bg-canvas px-6">
      {/* Left: breadcrumbs */}
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      {/* Right: search + optional primary action. NO dedicated chat button (spec). */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search... ⌘K"
          className="focus-ring h-8 w-52 rounded-sm border border-edge bg-surface px-3 type-ui text-ink placeholder:text-whisper"
        />
        {primaryAction}
      </div>
    </header>
  );
}
