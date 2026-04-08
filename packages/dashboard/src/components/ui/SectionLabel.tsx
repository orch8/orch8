interface SectionLabelProps {
  children: string;
  className?: string;
}

export function SectionLabel({ children, className = "" }: SectionLabelProps) {
  return (
    <div className={`mb-3 flex items-center gap-2 ${className}`}>
      <span aria-hidden className="inline-block h-3 w-[3px] bg-accent" />
      <span className="type-label text-mute">{children}</span>
    </div>
  );
}
