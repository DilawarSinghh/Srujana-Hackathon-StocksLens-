import { Skeleton } from "@/components/ui/skeleton";

/** Generic full-page loading skeleton reused across routes. */
export function GlobalSkeleton() {
  return (
    <div className="container py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-4 h-10 w-1/3" />
      <Skeleton className="mb-8 h-5 w-2/3" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <Skeleton className="mb-3 h-6 w-2/3" />
            <Skeleton className="mb-2 h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
