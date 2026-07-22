"use client";

import { useSession } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import PostForm from "@/components/PostForm";
import PostCard from "@/components/PostCard";
import RepostModal from "@/components/RepostModal";
import { usePosts } from "@/lib/hooks/usePosts";
import type { Post } from "@/types/post";

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
  const router = useRouter();
  const {
    posts,
    comments,
    likedPosts,
    expandedComments,
    showAllComments,
    viewedPosts,
    hasMore,
    isLoadingMore,
    setShowAllComments,
    setViewedPosts,
    loadMore,
    refreshPosts,
    handleLike,
    handleToggleComments,
    handleAddComment,
  } = usePosts();
  const [repostPost, setRepostPost] = useState<Post | null>(null);

  const handleDeletePost = async (postId: string) => {
    try {
      await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      refreshPosts();
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
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <div className="pl-60 max-md:pl-0">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6">
          {/* Заголовок ленты */}
          <h1 className="mb-6 text-xl font-bold text-zinc-900 animate-slideIn pl-12 sm:pl-0">Лента</h1>

          <PostForm onPostCreated={refreshPosts} />

          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 animate-fadeIn">
                Пока нет постов. Будь первым!
              </div>
            ) : (
              <>
                {posts.map((post, index) => (
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
                      onRepost={setRepostPost}
                      setViewedPosts={setViewedPosts}
                    />
                  </div>
                ))}
                {hasMore && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={loadMore}
                      disabled={isLoadingMore}
                      className="rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-50 hover:shadow-md disabled:opacity-50"
                    >
                      {isLoadingMore ? (
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
          onReposted={refreshPosts}
        />
      )}
    </div>
  );
}
