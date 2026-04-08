import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({
  label,
  error,
  className = "",
  id,
  ...rest
}: InputProps) {
  const generatedId =
    id ??
    (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="type-label text-mute">{label}</span>
      )}
      <input
        id={generatedId}
        className={`focus-ring h-9 rounded-sm border bg-canvas px-3 type-body text-ink placeholder:text-whisper ${
          error ? "border-red" : "border-edge"
        } ${className}`}
        {...rest}
      />
      {error && <span className="type-micro text-red">{error}</span>}
    </label>
  );
}
