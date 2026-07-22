"use client";

import { useState, useEffect } from "react";
import { Wind, Clock, ChevronDown, ChevronUp } from "lucide-react";
import Sidebar from "@/components/Sidebar";

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
        // раскрываем последнюю по умолчанию
        if (data.length > 0) {
          setExpanded(new Set([data[0].id]));
        }
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
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />
      <div className="pl-60 max-md:pl-0">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6 animate-fadeIn">
        <div className="mb-6 flex items-center gap-3 pl-12 sm:pl-0">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 animate-bounceIn">
            <Wind className="size-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 animate-slideIn">Обновления</h1>
            <p className="text-sm text-zinc-500">История изменений платформы</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white py-20 text-center animate-fadeIn">
            <Wind className="mx-auto size-10 text-zinc-300" />
            <p className="mt-3 text-sm text-zinc-500">Пока нет ни одного обновления</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <div
                key={note.id}
                className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(note.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-zinc-900 truncate">
                      {note.title}
                    </h2>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                      <Clock className="size-3" />
                      {new Date(note.createdAt).toLocaleDateString("ru-RU", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  {expanded.has(note.id) ? (
                    <ChevronUp className="size-5 shrink-0 text-zinc-400" />
                  ) : (
                    <ChevronDown className="size-5 shrink-0 text-zinc-400" />
                  )}
                </button>

                {expanded.has(note.id) && (
                  <div className="border-t border-zinc-100 px-5 py-4">
                    <div
                      className="prose prose-sm prose-zinc max-w-none"
                      dangerouslySetInnerHTML={{ __html: note.content }}
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
