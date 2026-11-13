"use client";

import { useSession } from "@/lib/auth-client";
import { useState, Suspense, useCallback, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import PostForm from "@/components/PostForm";
import PostCard from "@/components/PostCard";
import RepostModal from "@/components/RepostModal";
import TrendsPanel from "@/components/TrendsPanel";
import { usePosts } from "@/lib/hooks/usePosts";
import type { Post } from "@/types/post";

type FeedTab = 'for-you' | 'following';

export default function FeedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50">
        <Sidebar />
        <div className="pl-60 max-sm:pl-0">
          <div className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6">
            <div className="flex items-center justify-center py-16">
              <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
            </div>
          </div>
        </div>
      </div>
    }>
      <FeedContent />
    </Suspense>
  );
}

function FeedContent() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [feedTab, setFeedTab] = useState<FeedTab>('for-you');
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [linkedPost, setLinkedPost] = useState<Post | null>(null);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [feedPage, setFeedPage] = useState(1);
  const feedPageRef = useRef(feedPage);
  useEffect(() => {
    feedPageRef.current = feedPage;
  }, [feedPage]);
  const failedFeedRequest = useRef({ page: 1, append: false });
  const {
    comments,
    highlightPostId,
    highlightCommentId,
    expandedComments,
    showAllComments,
    viewedPosts,
    setShowAllComments,
    setViewedPosts,
    handleToggleComments,
    handleAddComment: addComment,
    updatePost,
  } = usePosts({ autoLoad: false });
  const displayedPosts = linkedPost?.id === highlightPostId && !feedPosts.some(post => post.id === linkedPost.id) ? [linkedPost, ...feedPosts] : feedPosts;
  const likedPosts = new Set(displayedPosts.filter(post => post.likes?.some(like => like.userId === session?.user?.id)).map(post => post.id));
  const pendingLikes = useRef(new Set<string>());
  const [feedError, setFeedError] = useState('');
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [pinnedPostId, setPinnedPostId] = useState<string | null>(null);
  const [repostPost, setRepostPost] = useState<Post | null>(null);

  const feedRequest = useRef<AbortController | null>(null);

  useEffect(() => () => feedRequest.current?.abort(), []);

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    if (append && feedRequest.current && !feedRequest.current.signal.aborted) return;
    feedRequest.current?.abort();
    const controller = new AbortController();
    feedRequest.current = controller;
    const endpoint = feedTab === 'for-you' ? '/api/feed/for-you' : '/api/feed/following';
    failedFeedRequest.current = { page: pageNum, append };
    setFeedLoading(true);
    setFeedLoadingMore(append);
    setFeedError('');
    try {
      const res = await fetch(`${endpoint}?page=${pageNum}&limit=10`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (append) {
          setFeedPosts(prev => Array.from(new Map([...prev, ...data.posts].map(post => [post.id, post])).values()));
        } else {
          setFeedPosts(data.posts);
        }
        feedPageRef.current = pageNum;
        setFeedPage(pageNum);
        setFeedHasMore(pageNum * 10 < data.total);
      } else {
        setFeedError("Не удалось загрузить ленту. Попробуй ещё раз.");
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Failed to load feed:', err);
      setFeedError('Нет соединения. Проверь интернет и попробуй ещё раз.');
    } finally {
      if (!controller.signal.aborted) { feedRequest.current = null; setFeedLoading(false); setFeedLoadingMore(false); }
    }
  }, [feedTab]);

  useEffect(() => {
    if (userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedPosts([]);
      setFeedHasMore(false);
      feedPageRef.current = 1;
      setFeedPage(1);
      loadFeed(1);
    }
  }, [userId, feedTab, loadFeed]);

  useEffect(() => {
    if (!highlightPostId || !session?.user?.id) return;
    const controller = new AbortController();
    fetch(`/api/posts/${encodeURIComponent(highlightPostId)}`, { signal: controller.signal }).then(async response => {
      if (response.ok) {
        const post: Post = await response.json();
        if (!controller.signal.aborted) setLinkedPost(post);
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [highlightPostId, session?.user?.id]);

  useEffect(() => {
    if (!highlightPostId || linkedPost?.id !== highlightPostId) return;
    const timer = setTimeout(() => document.getElementById(`post-${highlightPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return () => clearTimeout(timer);
  }, [highlightPostId, linkedPost?.id]);


  // Infinite scroll через IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleLoadMore = useCallback(async () => {
    const nextPage = feedPageRef.current + 1;
    await loadFeed(nextPage, true);
  }, [loadFeed]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !feedHasMore || feedLoading || feedError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && feedHasMore && !feedLoading) {
          handleLoadMore();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [feedHasMore, feedLoading, feedError, handleLoadMore]);

  // Для нового поста — сбрасываем на страницу 1, чтобы новый пост был наверху
  const handlePostCreated = useCallback(() => {
    setFeedPage(1);
    loadFeed(1);
  }, [loadFeed]);

  // Для репоста — сбрасываем на страницу 1, чтобы новый репост был наверху
  const handleReposted = useCallback(() => {
    setFeedPage(1);
    loadFeed(1);
  }, [loadFeed]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const controller = new AbortController();
    fetch('/api/bookmarks', { signal: controller.signal }).then(async response => {
      if (response.ok) {
        const posts: Post[] = await response.json();
        if (!controller.signal.aborted) setBookmarkedPosts(new Set(posts.map(post => post.id)));
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [session?.user?.id]);

  const updateDisplayedPosts = useCallback((update: (posts: Post[]) => Post[]) => {
    setFeedPosts(update);
    setLinkedPost(previous => previous ? update([previous])[0] ?? null : null);
  }, []);

  const handleAddComment = async (postId: string, content: string, parentId?: string) => {
    const added = await addComment(postId, content, parentId);
    if (added) updateDisplayedPosts(prev => prev.map(post => post.id === postId ? { ...post, _count: { ...post._count, likes: post._count?.likes ?? 0, comments: (post._count?.comments ?? 0) + 1 } } : post));
  };

  const handleBookmark = async (postId: string) => {
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) {
        const data = await res.json();
        setBookmarkedPosts(prev => {
          const newSet = new Set(prev);
          if (data.bookmarked) newSet.add(postId);
          else newSet.delete(postId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  const handleVote = async (pollId: string, optionId: string, postId?: string) => {
    try {
      const res = await fetch('/api/polls/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId, optionId }),
      });
      if (!res.ok) throw new Error('Не удалось проголосовать');
      if (postId) {
        // Обновляем результаты голосования локально
        const pollRes = await fetch(`/api/polls/vote?pollId=${pollId}`);
        if (pollRes.ok) {
          const updatedPoll = await pollRes.json();
          updatePost(postId, { poll: updatedPoll });
          updateDisplayedPosts(prev => prev.map(post => post.id === postId ? { ...post, poll: updatedPoll } : post));
        }
      }
    } catch (error) {
      console.error('Failed to vote:', error);
      throw error;
    }
  };

  const handlePin = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/pin`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPinnedPostId(data.pinned ? postId : null);
      }
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  // Обёртка handleLike, которая также обновляет feedPosts
  const handleFeedLike = useCallback(async (postId: string) => {
    if (pendingLikes.current.has(postId)) return;
    pendingLikes.current.add(postId);
    try {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        
        // Обновляем feedPosts, чтобы счётчик лайков отображался сразу
        updateDisplayedPosts((prev) =>
          prev.map((p) => {
            if (p.id !== postId) return p;
            const currentCount = p._count ?? { likes: 0, comments: 0, reposts: 0 };
            return {
              ...p,
              likes: data.liked
                ? [...p.likes.filter(like => like.userId !== session?.user?.id), { userId: session?.user?.id || "" }]
                : p.likes.filter((l) => l.userId !== session?.user?.id),
              _count: {
                ...currentCount,
                likes: data._count?.likes ?? (data.liked ? currentCount.likes + 1 : Math.max(0, currentCount.likes - 1)),
              },
            };
          })
        );
      }
    } catch (error) {
      console.error("Failed to toggle like:", error);
    } finally {
      pendingLikes.current.delete(postId);
    }
  }, [session, updateDisplayedPosts]);

  const handleDeletePost = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (response.ok) { updateDisplayedPosts(prev => prev.filter(post => post.id !== postId)); setLinkedPost(prev => prev?.id === postId ? null : prev); }
    } catch (error) {
      console.error("Failed to delete post:", error);
    }
  };

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />

      <div className="pl-60 max-sm:pl-0">
        <div className="feed-layout mx-auto flex max-w-6xl gap-8 px-4 py-8">
          <main className="min-w-0 flex-1 max-w-2xl">
            {/* Заголовок ленты */}
            <header className="feed-heading pl-12 sm:pl-0"><div><span className="eyebrow">НА СВОЕЙ ВОЛНЕ</span><h1>Твоя лента<span>✳</span></h1><p>Всё, что откликается.</p></div><span className="feed-edition">Z / 01</span></header>

            {/* Табы For You / Following — как в Twitter/X */}
            <div className="feed-tabs mb-5 flex border-b border-zinc-200 dark:border-zinc-800">
              <button
                aria-pressed={feedTab === 'for-you'}
                onClick={() => setFeedTab('for-you')}
                className={`relative flex-1 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  feedTab === 'for-you'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                Для тебя
                {feedTab === 'for-you' && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
              <button
                aria-pressed={feedTab === 'following'}
                onClick={() => setFeedTab('following')}
                className={`relative flex-1 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  feedTab === 'following'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                Подписки
                {feedTab === 'following' && (
                  <span className="absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
            </div>

            <PostForm onPostCreated={handlePostCreated} />

            <div className="space-y-4">
              {feedError && <div role="alert" className="feed-empty"><h2>Кажется, связь потерялась</h2><p>{feedError}</p><button onClick={() => loadFeed(failedFeedRequest.current.page, failedFeedRequest.current.append)} className="mt-4 rounded-full bg-indigo-600 px-5 py-2 text-white">Повторить</button></div>}
              {feedLoading && displayedPosts.length === 0 ? <div role="status" className="feed-empty">Ловим твою волну…</div> : displayedPosts.length === 0 ? (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center text-zinc-500 dark:text-zinc-400 animate-pop">
                  {feedTab === 'following' ? 'Вы ни на кого не подписаны. Подпишитесь, чтобы видеть посты!' : 'Пока нет постов. Будь первым!'}
                </div>
              ) : (
                <>
                  {displayedPosts.map((post, index) => (
                    <div key={post.id} style={{ animationDelay: `${index * 0.05}s` }}>
                      <PostCard
                        post={post}
                        currentUserId={session?.user?.id}
                        likedPosts={likedPosts}
                        comments={comments}
                        highlightedCommentId={highlightCommentId}
                        expandedComments={expandedComments}
                        showAllComments={showAllComments}
                        viewedPosts={viewedPosts}
                        onLike={handleFeedLike}
                        onToggleComments={handleToggleComments}
                        onToggleShowAll={(id) => {
                          const newSet = new Set(showAllComments);
                          if (newSet.has(id)) newSet.delete(id);
                          else newSet.add(id);
                          setShowAllComments(newSet);
                        }}
                        onAddComment={handleAddComment}
                      onDeletePost={handleDeletePost}
                        onEditPost={(postId, content) => {
                          updatePost(postId, { content });
                          updateDisplayedPosts(prev => prev.map(post => post.id === postId ? { ...post, content } : post));
                        }}
                        onRepost={setRepostPost}
                        onBookmark={handleBookmark}
                        bookmarkedPosts={bookmarkedPosts}
                        onPin={handlePin}
                        pinnedPostId={pinnedPostId}
                        onVote={handleVote}
                        setViewedPosts={setViewedPosts}
                      />
                    </div>
                  ))}
                  {/* Sentinel для IntersectionObserver (infinite scroll) */}
                  <div ref={sentinelRef} className="h-4" />
                  {feedHasMore && (
                    <div className="flex justify-center py-4">
                      <button
                        onClick={handleLoadMore}
                        disabled={feedLoading}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-all duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 hover:shadow-md disabled:opacity-50"
                      >
                        {feedLoadingMore ? (
                          <span className="flex items-center gap-2">
                            <div className="size-4 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
                            Загрузка...
                          </span>
                        ) : (
                          "Загрузить ещё"
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </main>

          {/* Правая колонка — тренды */}
          <aside className="hidden xl:block w-64 shrink-0">
            <div className="sticky top-6 space-y-4">
              <div className="wave-card"><span className="eyebrow">ЭТО ZEPHYR</span><div className="wave-symbol">✳</div><h2>Хорошо быть<br />на своей волне.</h2><p>Делись тем, что нравится.<br />Находи тех, кто понимает.</p><a href="/search">Найти своих ↗</a></div>
              <TrendsPanel />
              <p className="px-2 text-xs text-zinc-500">zephyr. · Меньше шума, больше тебя.</p>
            </div>
          </aside>
        </div>
      </div>

      {repostPost && (
        <RepostModal
          post={repostPost}
          onClose={() => setRepostPost(null)}
          onReposted={handleReposted}
        />
      )}
    </div>
  );
}
