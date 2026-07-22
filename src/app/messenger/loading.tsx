export default function MessengerLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="pl-60 max-md:pl-0 h-screen">
        <div className="flex h-full">
          <div className="w-[380px] max-md:w-full border-r border-zinc-200 dark:border-white/10">
            <div className="p-5">
              <div className="h-6 w-28 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-4" />
              <div className="h-10 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-4" />
            </div>
            <div className="space-y-2 px-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3.5">
                  <div className="size-12 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                    <div className="h-2 w-32 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
