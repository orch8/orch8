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

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        data-testid="drawer-backdrop"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`absolute top-0 ${sideClass} h-full w-[min(320px,85vw)] bg-sidebar transition-transform duration-[120ms] ease-out`}
      >
        {children}
      </div>
    </div>
  );
}
