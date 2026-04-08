interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-sm bg-surface-2 ${className}`}
      style={{ animationDuration: "1.4s" }}
      aria-hidden
    />
  );
}
