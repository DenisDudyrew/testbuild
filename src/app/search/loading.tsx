export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="pl-60 max-md:pl-0">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="h-7 w-24 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-5" />
          <div className="h-12 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse mb-6" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
