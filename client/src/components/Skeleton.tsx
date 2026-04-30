import { cn } from '../lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function FeedCardSkeleton() {
  return (
    <div className="os-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3 rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-2 my-5">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-11/12 rounded" />
        <Skeleton className="h-3 w-4/5 rounded" />
        <Skeleton className="h-3 w-10/12 rounded" />
      </div>
      <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/60">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
    </div>
  );
}
