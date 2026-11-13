"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Flame, Heart, MessageCircle, Repeat2, TrendingUp, Hash } from "lucide-react";
import Avatar from "@/components/Avatar";
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

interface PostResult {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null };
  _count?: { likes: number; comments: number; reposts: number };
}

interface HashtagResult {
  name: string;
  count: number;
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
  const [postResults, setPostResults] = useState<PostResult[]>([]);
  const [hashtagResults, setHashtagResults] = useState<HashtagResult[]>([]);
  const [exploreData, setExploreData] = useState<ExploreData | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingExplore, setIsLoadingExplore] = useState(true);
  const [searchMode, setSearchMode] = useState<'users' | 'posts' | 'hashtags'>('users');
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const searchPostsByHashtag = async (hashtag: string) => {
    try {
      const res = await fetch(`/api/posts/search?hashtag=${encodeURIComponent(hashtag)}`);
      if (res.ok) {
        const data = await res.json();
        setPostResults(data.posts);
        setIsSearching(true);
      }
    } catch {}
  };

  const loadTrendingHashtags = async () => {
    try {
      const res = await fetch('/api/hashtags/trending');
      if (res.ok) {
        const data = await res.json();
        setHashtagResults(data);
      }
    } catch {}
  };

  const searchPosts = async (q: string) => {
    try {
      const res = await fetch(`/api/posts/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setPostResults(data.posts);
        setIsSearching(true);
      }
    } catch {}
  };

  const searchHashtags = async (q: string) => {
    try {
      const res = await fetch(`/api/hashtags/trending`);
      if (res.ok) {
        const data = await res.json();
        setHashtagResults(data.filter((h: HashtagResult) => h.name.includes(q.toLowerCase())));
        setIsSearching(true);
      }
    } catch {}
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

  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadExplore();
    }
  }, [session]);

  // Handle hashtag from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashtag = params.get('hashtag');
    if (hashtag) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(`#${hashtag}`);
      setSearchMode('posts');
      searchPostsByHashtag(hashtag);
    }
    // Load trending hashtags
    loadTrendingHashtags();
  }, []);

  useEffect(() => {
    if (query.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchResults([]);
      setPostResults([]);
      setHashtagResults([]);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      if (searchMode === 'users') handleSearch(query);
      else if (searchMode === 'posts') searchPosts(query);
      else if (searchMode === 'hashtags') searchHashtags(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, searchMode]);

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
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />

      <main className="pl-60 max-sm:pl-0">
        <div className="mx-auto max-w-2xl px-4 py-6 animate-fadeIn">
          {/* Заголовок */}
          <h1 className="mb-5 text-xl font-bold text-zinc-900 dark:text-white animate-flyInLeft pl-12 sm:pl-0">Поиск</h1>

          {/* Поле поиска */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Поиск пользователей, постов, хештегов..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg py-3.5 pl-12 pr-4 text-sm outline-none transition-all duration-300 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Tabs */}
          {isSearching && (
            <div className="mb-4 flex gap-2 animate-fadeIn">
              <button
                onClick={() => setSearchMode('users')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  searchMode === 'users' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                }`}
              >
                Пользователи
              </button>
              <button
                onClick={() => { setSearchMode('posts'); if (query) searchPosts(query); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  searchMode === 'posts' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                }`}
              >
                Посты
              </button>
              <button
                onClick={() => { setSearchMode('hashtags'); if (query) searchHashtags(query); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  searchMode === 'hashtags' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50'
                }`}
              >
                Хештеги
              </button>
            </div>
          )}

          {isSearching && searchMode === 'users' && searchResults.length > 0 ? (
            <>
              <h2 className="mb-3 text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide animate-fadeIn">
                Пользователи
              </h2>
              <div className="space-y-1">
                {searchResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      router.push(`/profile/${user.id}`);
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 animate-flyInUp"
                  >
                    <Avatar id={user.id} src={user.avatar} name={user.username} size={11} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-900 dark:text-white">{user.username}</div>
                      {user.bio && (
                        <div className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.bio}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : isSearching && searchMode === 'users' && searchResults.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center animate-pop">
              <Search className="mx-auto mb-3 size-10 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Ничего не найдено</p>
            </div>
          ) : null}

          {/* Результаты поиска постов */}
          {isSearching && searchMode === 'posts' && postResults.length > 0 && (
            <div className="space-y-2">
              {postResults.map((post: PostResult) => (
                <button
                  key={post.id}
                  onClick={() => router.push(`/feed?postId=${post.id}`)}
                  className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg px-4 py-3 text-left transition-all duration-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 animate-flyInUp"
                >
                  <div className="flex items-center gap-3">
                    <Avatar id={post.user.id} src={post.user.avatar} name={post.user.username} size={7} />
                    <span className="text-sm font-medium text-zinc-900 dark:text-white">{post.user.username}</span>
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300">{post.content}</p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
                    <Heart className="size-3.5" />{post._count?.likes || 0}
                    <MessageCircle className="size-3.5" />{post._count?.comments || 0}
                    <Repeat2 className="size-3.5" />{post._count?.reposts || 0}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Результаты поиска хештегов */}
          {isSearching && searchMode === 'hashtags' && hashtagResults.length > 0 && (
            <div className="space-y-1">
              {hashtagResults.map((h: HashtagResult) => (
                <button
                  key={h.name}
                  onClick={() => {
                    setQuery(`#${h.name}`);
                    setSearchMode('posts');
                    searchPostsByHashtag(h.name);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 animate-flyInUp"
                >
                  <Hash className="size-5 text-indigo-400" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-indigo-600 dark:text-indigo-400">#{h.name}</div>
                    <div className="text-xs text-zinc-400 dark:text-zinc-500">{h.count} {h.count === 1 ? 'пост' : 'постов'}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {isSearching && searchMode === 'posts' && postResults.length === 0 && query && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center animate-pop">
              <Search className="mx-auto mb-3 size-10 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Посты не найдены</p>
            </div>
          )}

          {isSearching && searchMode === 'hashtags' && hashtagResults.length === 0 && query && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center animate-pop">
              <Hash className="mx-auto mb-3 size-10 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Хештеги не найдены</p>
            </div>
          )}

          {/* Блок популярного (когда не в режиме поиска) */}
          {!isSearching && (
            <>
              {isLoadingExplore ? (
                <div className="flex items-center justify-center py-16">
                  <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 dark:border-zinc-700 border-t-indigo-600" />
                </div>
              ) : exploreData ? (
                <>
                  {/* Популярные пользователи */}
                  {exploreData.popularUsers.length > 0 && (
                    <div className="mb-8">
                      <div className="mb-3 flex items-center gap-2">
                        <TrendingUp className="size-5 text-indigo-500" />
                        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Популярные пользователи</h2>
                      </div>
                      <div className="space-y-1">
                        {exploreData.popularUsers.map((user, i) => (
                          <button
                            key={user.id}
                            onClick={() => router.push(`/profile/${user.id}`)}
                            className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left transition-all duration-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 animate-flyInUp"
                          >
                            <span className="w-6 text-center text-sm font-bold text-zinc-300 dark:text-zinc-600">{i + 1}</span>
                            <Avatar id={user.id} src={user.avatar} name={user.username} size={10} />
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-zinc-900 dark:text-white">{user.username}</div>
                              <div className="text-xs text-zinc-400 dark:text-zinc-500">
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
                        <h2 className="text-base font-bold text-zinc-900 dark:text-white">Популярные посты</h2>
                      </div>
                      <div className="space-y-2">
                        {exploreData.popularPosts.map((post) => (
                          <button
                            key={post.id}
                            onClick={() => router.push(`/feed?postId=${post.id}`)}
                            className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg px-4 py-3 text-left transition-all duration-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:border-indigo-500/20 animate-flyInUp"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar id={post.user.id} src={post.user.avatar} name={post.user.username} size={7} />
                              <span className="text-sm font-medium text-zinc-900 dark:text-white">{post.user.username}</span>
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatTime(post.createdAt)}</span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                              {post.content || (post.mediaUrl ? '[Медиа]' : '')}
                            </p>
                            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500">
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
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-8 text-center text-zinc-500 dark:text-zinc-400">
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
