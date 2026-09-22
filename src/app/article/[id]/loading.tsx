import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-4 h-10 w-full" />
      <Skeleton className="mt-2 h-10 w-3/4" />
      <Skeleton className="mt-4 h-4 w-2/3" />
      <Skeleton className="mt-6 h-8 w-64" />
      <Skeleton className="mt-10 h-40 w-full" />
    </div>
  );
}
