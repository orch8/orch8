import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "default" | "sm" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-canvas hover:bg-[color:var(--color-accent-hover)] border border-transparent",
  secondary:
    "bg-surface text-ink border border-edge hover:bg-surface-2",
  ghost:
    "bg-transparent text-mute hover:text-ink border border-transparent",
  danger:
    "bg-transparent text-red border border-red hover:bg-surface-2",
};

const SIZE_CLASSES: Record<Size, string> = {
  default: "px-[0.95rem] py-[0.55rem] type-ui rounded-sm",
  sm: "px-3 py-1 type-label rounded-sm",
  icon: "h-7 w-7 flex items-center justify-center rounded-sm",
};

export function Button({
  variant = "secondary",
  size = "default",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`focus-ring inline-flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
