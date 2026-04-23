import type { ReactNode } from "react";
import { Badge } from "./Badge.js";

interface PillProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function Pill({ label, value, className = "" }: PillProps) {
  return (
    <Badge variant="outline" size="lg" className={`items-baseline gap-2 ${className}`}>
      <span className="type-micro text-whisper">{label}</span>
      <span className="type-mono text-ink">{value}</span>
    </Badge>
  );
}
