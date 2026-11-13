export default function NotificationsLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="pl-60 max-sm:pl-0">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="h-7 w-36 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-5" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-4 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse">
                <div className="size-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-zinc-300 dark:bg-zinc-700" />
                  <div className="h-2 w-1/4 rounded bg-zinc-300 dark:bg-zinc-700" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
