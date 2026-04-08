import { useEffect, type RefObject } from "react";

/**
 * Modal accessibility hook.
 *
 * Wires up Escape-to-close, focus-trap, and focus restoration for a modal
 * dialog. The caller is responsible for rendering `role="dialog"`,
 * `aria-modal="true"`, and `aria-labelledby` on the container element referenced
 * by `ref`, and for handling backdrop click-to-close outside the dialog
 * content.
 *
 * On mount (when `isOpen` flips true):
 *   - Captures the previously focused element.
 *   - Focuses the first focusable descendant inside `ref`.
 *   - Installs a `keydown` listener on `document` that (a) calls `onClose` on
 *     Escape, (b) cycles Tab / Shift+Tab between the first and last focusable
 *     descendants when focus would otherwise escape the dialog.
 *
 * On unmount (or when `isOpen` flips false), restores focus and removes the
 * listener.
 */
export function useModalA11y(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return;

    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the first focusable element inside the modal.
    const focusables = getFocusableElements(container);
    if (focusables.length > 0) {
      focusables[0]?.focus();
    } else {
      // Fallback: focus the container itself so keystrokes land somewhere
      // inside the dialog.
      container.setAttribute("tabindex", "-1");
      container.focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      if (!container) return;
      const current = getFocusableElements(container);
      if (current.length === 0) {
        e.preventDefault();
        return;
      }

      const first = current[0]!;
      const last = current[current.length - 1]!;
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to whatever was focused before the modal opened.
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [ref, isOpen, onClose]);
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}
