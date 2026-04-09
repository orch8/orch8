import { useRef, type ReactNode } from "react";
import { useModalA11y } from "../../hooks/useModalA11y.js";

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
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-full max-sm:inset-0 max-sm:fixed max-sm:rounded-none sm:max-w-lg sm:rounded-lg border border-edge bg-surface p-[var(--gap-section)] shadow-xl ${className}`}
      >
        <div className="mb-[var(--gap-block)] flex items-center justify-between">
          <h3 id="modal-title" className="type-section text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="focus-ring rounded-sm px-2 py-1 type-ui text-mute hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
