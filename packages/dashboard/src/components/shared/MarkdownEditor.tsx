import { useState, useRef, useCallback } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer.js";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}

type InsertAction = { prefix: string; suffix: string; placeholder: string };

const TOOLBAR_ACTIONS: Array<{ label: string; action: InsertAction }> = [
  { label: "Bold", action: { prefix: "**", suffix: "**", placeholder: "bold text" } },
  { label: "Italic", action: { prefix: "_", suffix: "_", placeholder: "italic text" } },
  { label: "Code", action: { prefix: "`", suffix: "`", placeholder: "code" } },
  { label: "Link", action: { prefix: "[", suffix: "](url)", placeholder: "link text" } },
];

export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        onSubmit?.();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        insertAround("**", "**", "bold text");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") {
        e.preventDefault();
        insertAround("_", "_", "italic text");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        insertAround("[", "](url)", "link text");
      }
    },
    [onSubmit, value],
  );

  function insertAround(prefix: string, suffix: string, fallback: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const newVal = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + prefix.length + selected.length;
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }

  return (
    <div className={`rounded-md border border-zinc-800 bg-zinc-900 ${className ?? ""}`}>
      {/* Tabs + Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-1">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setTab("write")}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              tab === "write" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab("preview")}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              tab === "preview" ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Preview
          </button>
        </div>

        {tab === "write" && (
          <div className="flex gap-0.5">
            {TOOLBAR_ACTIONS.map(({ label, action }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                onClick={() => insertAround(action.prefix, action.suffix, action.placeholder)}
                className="rounded p-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
              >
                {label === "Bold" && <span className="font-bold">B</span>}
                {label === "Italic" && <span className="italic">I</span>}
                {label === "Code" && <span className="font-mono">&lt;/&gt;</span>}
                {label === "Link" && <span>🔗</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {tab === "write" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[80px] w-full resize-y bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
        />
      ) : (
        <div className="min-h-[80px] px-3 py-2">
          {value ? (
            <MarkdownRenderer content={value} />
          ) : (
            <p className="text-sm text-zinc-600">Nothing to preview</p>
          )}
        </div>
      )}
    </div>
  );
}
