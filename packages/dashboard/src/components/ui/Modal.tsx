import { useRef, type ReactNode } from "react";
import { useModalA11y } from "../../hooks/useModalA11y.js";
import { Button } from "./Button.js";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className = "" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        data-testid="modal-backdrop"
        className="absolute inset-0 bg-black/32 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden border border-border bg-popover text-popover-foreground shadow-lg/5 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[calc(100vh-3rem)] max-sm:rounded-t-2xl sm:max-w-lg sm:rounded-2xl ${className}`}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h3 id="modal-title" className="type-section text-foreground">{title}</h3>
          <Button
            type="button"
            onClick={onClose}
            size="icon-sm"
            variant="ghost"
            aria-label="Close"
          >
            ✕
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
