"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Flame, Heart, MessageCircle, Repeat2, Wind, TrendingUp } from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface SearchUser {
  id: string;
  username: string;
  avatar: string | null;
  bio: string | null;
  _count?: { posts: number };
}

interface PopularPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
  _count: { likes: number; comments: number; reposts: number };
}

interface ExploreData {
  popularUsers: (SearchUser & { _count: { posts: number } })[];
  popularPosts: PopularPost[];
}

export default function SearchPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [exploreData, setExploreData] = useState<ExploreData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingExplore, setIsLoadingExplore] = useState(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) {
      loadExplore();
      // Фокус на поле поиска при загрузке
      searchInputRef.current?.focus();
    }
  }, [session]);

  useEffect(() => {
    if (query.length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      handleSearch(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const loadExplore = async () => {
    try {
      const res = await fetch('/api/explore');
      if (res.ok) {
        const data = await res.json();
        setExploreData(data);
      }
    } catch (error) {
      console.error('Failed to load explore data:', error);
    } finally {
      setIsLoadingExplore(false);
    }
  };

  const handleSearch = async (q: string) => {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setIsSearching(true);
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin}м`;
    if (diffHour < 24) return `${diffHour}ч`;
    if (diffDay < 7) return `${diffDay}д`;
    return date.toLocaleDateString();
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="pl-60 max-md:pl-0">
        <div className="mx-auto max-w-2xl px-4 py-6 animate-fadeIn">
          {/* Заголовок */}
          <h1 className="mb-5 text-xl font-bold text-zinc-900 animate-slideIn pl-12 sm:pl-0">Поиск</h1>

          {/* Поле поиска */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Поиск пользователей..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-2xl border border-zinc-200 bg-white py-3.5 pl-12 pr-4 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {isSearching && searchResults.length > 0 ? (
            <>
              <h2 className="mb-3 text-sm font-semibold text-zinc-500 uppercase tracking-wide">
                Пользователи
              </h2>
              <div className="space-y-1">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      router.push(`/profile/${user.id}`);
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-zinc-100"
                  >
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.username} className="size-11 rounded-full object-cover" />
                    ) : (
                      <div className="flex size-11 items-center justify-center rounded-full bg-zinc-200 text-zinc-400">
                        <User className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-900">{user.username}</div>
                      {user.bio && (
                        <div className="truncate text-sm text-zinc-500">{user.bio}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : isSearching && searchResults.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center animate-fadeIn">
              <Search className="mx-auto mb-3 size-10 text-zinc-300" />
              <p className="text-sm text-zinc-500">Ничего не найдено</p>
            </div>
          ) : null}

          {/* Блок популярного (когда не в режиме поиска) */}
          {!isSearching && (
            <>
              {isLoadingExplore ? (
                <div className="flex items-center justify-center py-16">
                  <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
                </div>
              ) : exploreData ? (
                <>
                  {/* Популярные пользователи */}
                  {exploreData.popularUsers.length > 0 && (
                    <div className="mb-8">
                      <div className="mb-3 flex items-center gap-2">
                        <TrendingUp className="size-5 text-indigo-500" />
                        <h2 className="text-base font-bold text-zinc-900">Популярные пользователи</h2>
                      </div>
                      <div className="space-y-1">
                        {exploreData.popularUsers.map((user, i) => (
                          <button
                            key={user.id}
                            onClick={() => router.push(`/profile/${user.id}`)}
                            className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-zinc-100"
                          >
                            <span className="w-6 text-center text-sm font-bold text-zinc-300">{i + 1}</span>
                            {user.avatar ? (
                              <img src={user.avatar} alt={user.username} className="size-10 rounded-full object-cover" />
                            ) : (
                              <div className="flex size-10 items-center justify-center rounded-full bg-zinc-200 text-zinc-400">
                                <User className="size-4" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-zinc-900">{user.username}</div>
                              <div className="text-xs text-zinc-400">
                                {user._count.posts} {user._count.posts === 1 ? 'пост' : 'постов'}
                              </div>
                            </div>
                            <Flame className="size-4 text-amber-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Популярные посты */}
                  {exploreData.popularPosts.length > 0 && (
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <Flame className="size-5 text-amber-500" />
                        <h2 className="text-base font-bold text-zinc-900">Популярные посты</h2>
                      </div>
                      <div className="space-y-2">
                        {exploreData.popularPosts.map((post) => (
                          <button
                            key={post.id}
                            onClick={() => router.push(`/feed?postId=${post.id}`)}
                            className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:bg-zinc-50"
                          >
                            <div className="flex items-center gap-3">
                              {post.user.avatar ? (
                                <img src={post.user.avatar} alt={post.user.username} className="size-7 rounded-full object-cover" />
                              ) : (
                                <div className="size-7 rounded-full bg-zinc-200" />
                              )}
                              <span className="text-sm font-medium text-zinc-900">{post.user.username}</span>
                              <span className="text-xs text-zinc-400">{formatTime(post.createdAt)}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-zinc-700 leading-relaxed">
                              {post.content || (post.mediaUrl ? '[Медиа]' : '')}
                            </p>
                            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                              <span className="flex items-center gap-1">
                                <Heart className="size-3.5" />{post._count.likes}
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageCircle className="size-3.5" />{post._count.comments}
                              </span>
                              <span className="flex items-center gap-1">
                                <Repeat2 className="size-3.5" />{post._count.reposts}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
                  <p className="text-sm">Не удалось загрузить данные</p>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
