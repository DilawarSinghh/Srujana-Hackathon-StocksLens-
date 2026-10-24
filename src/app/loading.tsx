import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="container flex flex-col gap-8 py-10" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <section className="flex flex-col items-center gap-4 py-6">
        <Skeleton className="h-10 w-2/3 max-w-xl" />
        <Skeleton className="h-5 w-1/2 max-w-md" />
        <Skeleton className="h-10 w-full max-w-xl" />
      </section>
      <section className="flex flex-col gap-4">
        <Skeleton className="h-6 w-56" />
        <div className="flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      </section>
    </div>
  );
}
