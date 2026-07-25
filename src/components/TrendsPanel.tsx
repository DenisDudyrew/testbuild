"use client";

import { useState, useEffect } from "react";
import { TrendingUp, Loader2, Hash } from "lucide-react";

interface Trend {
  hashtag: string;
  count: number;
  postCount?: number;
}

export default function TrendsPanel() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrends() {
      try {
        const res = await fetch("/api/hashtags/trending");
        if (res.ok) {
          const data = await res.json();
          setTrends(data.hashtags || []);
        }
      } catch (err) {
        console.error("Failed to fetch trends:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTrends();
  }, []);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <TrendingUp className="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Тренды</h2>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-zinc-400" />
        </div>
      ) : trends.length === 0 ? (
        <div className="px-4 pb-4 text-xs text-zinc-400 dark:text-zinc-500">
          Пока нет трендов
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {trends.map((trend, index) => (
            <li key={trend.hashtag}>
              <a
                href={`/search?q=${encodeURIComponent(trend.hashtag)}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 group"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Hash className="size-3 text-zinc-400 shrink-0" />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {trend.hashtag}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {trend.postCount ?? trend.count} постов
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* Footer */}
      <a
        href="/trends"
        className="block px-4 py-3 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors rounded-b-2xl"
      >
        Показать все тренды
      </a>
    </div>
  );
}