export default function FeedLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="pl-60 max-sm:pl-0">
        <div className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6">
          {/* Skeleton: tabs */}
          <div className="flex gap-1 mb-6">
            <div className="h-9 w-28 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            <div className="h-9 w-28 rounded-xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
          </div>
          {/* Skeleton: post form */}
          <div className="mb-8 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 p-4">
            <div className="h-20 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
          {/* Skeleton: posts */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="mb-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="size-10 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-4 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-full rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
