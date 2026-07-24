"use client";

import { useSession } from "next-auth/react";
import { useState, Suspense, useCallback, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import PostForm from "@/components/PostForm";
import PostCard from "@/components/PostCard";
import RepostModal from "@/components/RepostModal";
import { usePosts } from "@/lib/hooks/usePosts";
import type { Post } from "@/types/post";

type FeedTab = 'for-you' | 'following';

export default function FeedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-50">
        <Sidebar />
        <div className="pl-60 max-md:pl-0">
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
  const [feedTab] = useState<FeedTab>('for-you');
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedPage, setFeedPage] = useState(1);
  const feedPageRef = useRef(feedPage);
  useEffect(() => {
    feedPageRef.current = feedPage;
  }, [feedPage]);
  const [, setFeedTotal] = useState(0);
  const {
    comments,
    likedPosts,
    expandedComments,
    showAllComments,
    viewedPosts,
    setShowAllComments,
    setViewedPosts,
    handleLike,
    handleToggleComments,
    handleAddComment,
    updatePost,
    refreshPosts: refreshAll,
  } = usePosts();
  const [bookmarkedPosts, setBookmarkedPosts] = useState<Set<string>>(new Set());
  const [pinnedPostId, setPinnedPostId] = useState<string | null>(null);
  const [repostPost, setRepostPost] = useState<Post | null>(null);

  const loadFeed = useCallback(async (pageNum = 1, append = false) => {
    const endpoint = feedTab === 'for-you' ? '/api/feed/for-you' : '/api/feed/following';
    setFeedLoading(true);
    try {
      const res = await fetch(`${endpoint}?page=${pageNum}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setFeedPosts(prev => [...prev, ...data.posts]);
        } else {
          setFeedPosts(data.posts);
        }
        setFeedTotal(data.total);
        setFeedHasMore(pageNum * 10 < data.total);
      }
    } catch (err) {
      console.error('Failed to load feed:', err);
    } finally {
      setFeedLoading(false);
    }
  }, [feedTab]);

  useEffect(() => {
    if (session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFeedPage(1);
      loadFeed(1);
    }
  }, [session, feedTab, loadFeed]);

  const handleLoadMore = useCallback(async () => {
    const nextPage = feedPage + 1;
    setFeedPage(nextPage);
    await loadFeed(nextPage, true);
  }, [feedPage, loadFeed]);

  // Для нового поста — сбрасываем на страницу 1, чтобы новый пост был наверху
  const handlePostCreated = useCallback(() => {
    setFeedPage(1);
    loadFeed(1);
    refreshAll();
  }, [loadFeed, refreshAll]);

  // Для репоста — сбрасываем на страницу 1, чтобы новый репост был наверху
  const handleReposted = useCallback(() => {
    setFeedPage(1);
    loadFeed(1);
  }, [loadFeed]);

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
      if (res.ok && postId) {
        // Обновляем результаты голосования локально
        const pollRes = await fetch(`/api/polls/vote?pollId=${pollId}`);
        if (pollRes.ok) {
          const updatedPoll = await pollRes.json();
          updatePost(postId, { poll: updatedPoll });
        }
      }
    } catch (error) {
      console.error('Failed to vote:', error);
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

  const handleDeletePost = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      refreshAll();
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

      <div className="pl-60 max-md:pl-0">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6">
          {/* Заголовок ленты */}
          <h1 className="mb-6 text-xl font-bold text-zinc-900 dark:text-white animate-flyInLeft pl-12 sm:pl-0">Лента</h1>

          <PostForm onPostCreated={handlePostCreated} />

          <div className="space-y-4">
            {feedPosts.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center text-zinc-500 dark:text-zinc-400 animate-pop">
                {feedTab === 'following' ? 'Вы ни на кого не подписаны. Подпишитесь, чтобы видеть посты!' : 'Пока нет постов. Будь первым!'}
              </div>
            ) : (
              <>
                {feedPosts.map((post, index) => (
                  <div key={post.id} style={{ animationDelay: `${index * 0.05}s` }}>
                    <PostCard
                      post={post}
                      currentUserId={session?.user?.id}
                      likedPosts={likedPosts}
                      comments={comments}
                      expandedComments={expandedComments}
                      showAllComments={showAllComments}
                      viewedPosts={viewedPosts}
                      onLike={handleLike}
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
                {feedHasMore && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={handleLoadMore}
                      disabled={feedLoading}
                      className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 transition-all duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 hover:shadow-md disabled:opacity-50"
                    >
                      {feedLoading ? (
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
