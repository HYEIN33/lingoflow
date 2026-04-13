import { cn } from '../lib/utils';

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-gray-200 rounded-lg", className)} />;
}

/** Skeleton matching the dual-column translation result card */
export function TranslationSkeleton() {
  return (
    <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Authentic column skeleton */}
        <div className="bg-blue-50/50 rounded-2xl p-4 sm:p-6 border border-blue-100 space-y-3">
          <Skeleton className="h-3 w-24 bg-blue-200" />
          <Skeleton className="h-5 w-full bg-blue-100" />
          <Skeleton className="h-5 w-3/4 bg-blue-100" />
        </div>
        {/* Academic column skeleton */}
        <div className="bg-purple-50/50 rounded-2xl p-4 sm:p-6 border border-purple-100 space-y-3">
          <Skeleton className="h-3 w-24 bg-purple-200" />
          <Skeleton className="h-5 w-full bg-purple-100" />
          <Skeleton className="h-5 w-2/3 bg-purple-100" />
        </div>
      </div>
      {/* Feedback bar skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-7 rounded-lg" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
    </div>
  );
}

/** Skeleton matching a slang insight card in the sidebar */
export function SlangInsightSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100 space-y-2">
          <Skeleton className="h-4 w-20 bg-indigo-200" />
          <Skeleton className="h-3 w-full bg-indigo-100" />
          <Skeleton className="h-3 w-2/3 bg-indigo-100" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton matching wordbook list items */
export function WordbookListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3">
          <Skeleton className="w-2 h-2 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
