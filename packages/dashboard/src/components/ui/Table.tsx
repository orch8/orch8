import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

export function Table({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-md border border-edge-soft ${className}`}>
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-edge-soft">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={`border-b border-dashed border-edge-soft last:border-0 hover:bg-surface-2 ${className}`}
    >
      {children}
    </tr>
  );
}

export function TH({
  children,
  className = "",
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      className={`type-label px-4 py-2.5 text-left text-mute ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className = "",
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <td className={`type-body px-4 py-3 text-ink ${className}`} {...rest}>
      {children}
    </td>
  );
}
