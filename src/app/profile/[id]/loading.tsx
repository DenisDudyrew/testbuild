export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="pl-60 max-md:pl-0">
        {/* Header skeleton */}
        <div className="h-48 bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-end gap-4 -mt-12 mb-6">
            <div className="size-24 rounded-full border-4 border-white dark:border-zinc-950 bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="space-y-2 pb-2">
              <div className="h-5 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
