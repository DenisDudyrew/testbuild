"use client";

import { useSession } from "@/lib/auth-client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Avatar from "@/components/Avatar";
import { Heart, MessageCircle } from "lucide-react";

interface Post {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
  likes: Array<{ userId: string }>;
  _count: { likes: number; comments: number; reposts: number };
}

export default function BookmarksPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [bookmarks, setBookmarks] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks');
      if (res.ok) {
        const data = await res.json();
        setBookmarks(data);
      }
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) // eslint-disable-next-line react-hooks/set-state-in-effect
    loadBookmarks();
  }, [session]);

  const removeBookmark = async (postId: string) => {
    try {
      await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      setBookmarks(prev => prev.filter(p => p.id !== postId));
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />
      <div className="pl-60 max-sm:pl-0">
        <main className="mx-auto max-w-2xl px-4 py-6 animate-fadeIn">
          <h1 className="mb-6 text-xl font-bold text-zinc-900 dark:text-white animate-flyInLeft pl-12 sm:pl-0 flex items-center gap-2">
            <Bookmark className="size-5 text-indigo-500" />
            Закладки
          </h1>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center">
              <Bookmark className="mx-auto mb-3 size-10 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">У вас пока нет закладок</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Нажмите на значок закладки у поста, чтобы сохранить его</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookmarks.map((post) => (
                <div
                  key={post.id}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-4 shadow-sm transition-all duration-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <Avatar id={post.user.id} src={post.user.avatar} name={post.user.username} size={10} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-sm font-semibold text-zinc-900 dark:text-white cursor-pointer hover:text-indigo-600"
                          onClick={() => router.push(`/profile/${post.user.id}`)}
                        >
                          {post.user.username}
                        </span>
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p
                        className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer"
                        onClick={() => router.push(`/feed?postId=${post.id}`)}
                      >
                        {post.content}
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Heart className="size-3.5" /> {post._count.likes}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="size-3.5" /> {post._count.comments}
                        </span>
                        <button
                          onClick={() => removeBookmark(post.id)}
                          className="ml-auto text-indigo-500 hover:text-indigo-600 transition-colors"
                        >
                          <Bookmark className="size-3.5 fill-current" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
