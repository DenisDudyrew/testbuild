"use client";

import { useState, useEffect } from "react";
import { Wind, Clock, ChevronDown, ChevronUp } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { themeSafeHtml } from "@/lib/release-note-html";

interface ReleaseNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export default function UpdatesPage() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/release-notes")
      .then((res) => res.json())
      .then((data) => {
        setNotes(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <div className="pl-60 max-sm:pl-0">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6 animate-fadeIn">
        <div className="mb-6 flex items-center gap-3 pl-12 sm:pl-0">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/50 animate-bounceIn">
            <Wind className="size-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white animate-slideIn">Обновления</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">История изменений платформы</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 dark:border-zinc-700 border-t-indigo-600" />
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 py-20 text-center animate-fadeIn">
            <Wind className="mx-auto size-10 text-zinc-300 dark:text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Пока нет ни одного обновления</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(note.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-white truncate">
                      {note.title}
                    </h2>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                      <Clock className="size-3" />
                      {new Date(note.createdAt).toLocaleDateString("ru-RU", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  {expanded.has(note.id) ? (
                    <ChevronUp className="size-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  ) : (
                    <ChevronDown className="size-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
                  )}
                </button>

                {expanded.has(note.id) && (
                  <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 py-4">
                    <div
                      className="prose prose-sm prose-zinc max-w-none dark:prose-invert prose-headings:text-zinc-900 dark:prose-headings:text-zinc-100 prose-p:text-zinc-700 dark:prose-p:text-zinc-300 prose-li:text-zinc-700 dark:prose-li:text-zinc-300 prose-strong:text-zinc-900 dark:prose-strong:text-zinc-100 prose-a:text-indigo-600 dark:prose-a:text-indigo-400"
                      dangerouslySetInnerHTML={{ __html: themeSafeHtml(note.content) }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
