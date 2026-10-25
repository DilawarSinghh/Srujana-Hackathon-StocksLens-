import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityLoading() {
  return (
    <div className="container py-6" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="hidden flex-col gap-4 lg:flex">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
