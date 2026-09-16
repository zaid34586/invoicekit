// Shape-based loading placeholder (skeleton) used while list/dashboard data
// loads. Replaces a raw spinner so pages feel faster and more polished.
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`}
      aria-hidden="true"
    />
  );
}
