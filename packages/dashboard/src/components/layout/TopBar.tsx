import type { ReactNode } from "react";
import { Breadcrumbs } from "./Breadcrumbs.js";

interface TopBarProps {
  primaryAction?: ReactNode;
  onHamburgerClick?: () => void;
}

export function TopBar({ primaryAction, onHamburgerClick }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-edge-soft bg-canvas px-[var(--pad-page)]">
      {/* Left: hamburger (narrow only) + breadcrumbs */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {onHamburgerClick && (
          <button
            onClick={onHamburgerClick}
            className="focus-ring shrink-0 rounded-sm px-2 py-1 type-ui text-mute hover:text-ink"
            aria-label="Open menu"
          >
            Menu
          </button>
        )}
        <Breadcrumbs compact={!!onHamburgerClick} />
      </div>

      {/* Right: search (hidden on <md via CSS) + optional primary action */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search... ⌘K"
          className="focus-ring hidden h-8 w-52 rounded-sm border border-edge bg-surface px-3 type-ui text-ink placeholder:text-whisper md:block"
        />
        {primaryAction}
      </div>
    </header>
  );
}
