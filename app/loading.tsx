import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="loading-page" role="status" aria-label="Loading workspace">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-16 w-3/4" />
      <div className="metrics-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
      <span className="sr-only">Gathering your universe…</span>
    </div>
  );
}
