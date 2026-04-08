import type { AnchorHTMLAttributes, ReactNode } from "react";

interface EntityLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
}

export function EntityLink({ children, className = "", ...rest }: EntityLinkProps) {
  return (
    <a
      className={`focus-ring type-mono text-blue underline decoration-blue/40 decoration-dotted underline-offset-2 hover:decoration-blue ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}
