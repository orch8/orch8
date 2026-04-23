import { useEffect, useRef, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right";
}

export function Drawer({ open, onClose, children, side = "left" }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus the panel when it opens.
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const sideClass = side === "left" ? "left-0" : "right-0";
  const borderClass = side === "left" ? "border-r" : "border-l";

  return (
    <div className="fixed inset-0 z-40">
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/32 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`absolute top-0 ${sideClass} ${borderClass} h-full w-[min(var(--size-drawer-width),85vw)] bg-popover text-popover-foreground shadow-lg/5 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]`}
      >
        {children}
      </div>
    </div>
  );
}
