import { useState, useRef, useEffect } from "react";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  renderDisplay?: (value: string) => React.ReactNode;
  inputType?: "text" | "select";
  options?: { value: string; label: string }[];
  className?: string;
}

export function InlineEdit({
  value,
  onSave,
  renderDisplay,
  inputType = "text",
  options,
  className,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    if (draft !== value) onSave(draft);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`cursor-pointer text-left hover:bg-zinc-800/50 rounded px-1 -mx-1 ${className ?? ""}`}
      >
        {renderDisplay ? renderDisplay(value) : <span className="text-sm text-zinc-300">{value || "\u2014"}</span>}
      </button>
    );
  }

  if (inputType === "select" && options) {
    return (
      <select
        ref={inputRef as any}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); }}
        onBlur={commit}
        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as any}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none"
    />
  );
}
