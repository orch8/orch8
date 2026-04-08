import type { AnchorHTMLAttributes, ReactNode } from "react";

interface TextLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
}

export function TextLink({ children, className = "", ...rest }: TextLinkProps) {
  return (
    <a
      className={`focus-ring text-ink underline decoration-edge underline-offset-2 transition-colors hover:text-accent hover:decoration-accent ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}
