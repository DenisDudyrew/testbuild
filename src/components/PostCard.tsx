"use client";

import { useState } from "react";
import { Heart, MessageCircle, Repeat2, Edit2, X, Trash2, MessageSquareMore } from "lucide-react";
import { useRouter } from "next/navigation";
import ViewTracker from "@/components/ViewTracker";
import CommentSection from "@/components/CommentSection";
import { useToast } from "@/components/ToastProvider";
import type { Post } from "@/types/post";

interface PostCardProps {
  post: Post;
  currentUserId?: string;
  likedPosts: Set<string>;
  comments: Record<string, any[]>;
  expandedComments: Set<string>;
  showAllComments: Set<string>;
  viewedPosts: Set<string>;
  highlightedCommentId?: string | null;
  onLike: (postId: string) => void;
  onToggleComments: (postId: string) => void;
  onToggleShowAll: (postId: string) => void;
  onAddComment: (postId: string, content: string, parentId?: string) => void;
  onDeletePost: (postId: string) => void;
  onRepost: (post: Post) => void;
  setViewedPosts: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function PostCard({
  post,
  currentUserId,
  likedPosts,
  comments,
  expandedComments,
  showAllComments,
  viewedPosts,
  highlightedCommentId,
  onLike,
  onToggleComments,
  onToggleShowAll,
  onAddComment,
  onDeletePost,
  onRepost,
  setViewedPosts,
}: PostCardProps) {
  const router = useRouter();
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(null);
  const { showAlert, showConfirm } = useToast();

  const canEditPost = (p: Post) => {
    if (p.user.id !== currentUserId) return false;
    const tenMinutesInMs = 10 * 60 * 1000;
    const timeSinceCreation = Date.now() - new Date(p.createdAt).getTime();
    return timeSinceCreation < tenMinutesInMs;
  };

  const canDeletePost = (p: Post) => p.user.id === currentUserId;

  const handleEditPost = async (postId: string) => {
    if (!editContent.trim()) return;
    try {
      const response = await fetch(`/api/posts/${postId}/edit`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (response.ok) {
        setEditingPost(null);
        setEditContent("");
        window.location.reload();
      } else {
        const data = await response.json();
        showAlert(data.error || "Failed to edit post");
      }
    } catch (error) {
      console.error("Failed to edit post:", error);
    }
  };

  const handleDelete = async (postId: string) => {
    const confirmed = await showConfirm("Вы уверены, что хотите удалить этот пост?");
    if (!confirmed) return;
    onDeletePost(postId);
  };

  return (
    <article
      id={`post-${post.id}`}
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-md animate-rise"
    >
      <div className="flex items-start gap-3">
        {post.user.avatar ? (
          <img
            src={post.user.avatar}
            alt={post.user.username}
            className="size-10 shrink-0 rounded-full object-cover cursor-pointer ring-2 ring-zinc-200 transition-all duration-200 hover:ring-indigo-400"
            onClick={() => router.push(`/profile/${post.user.id}`)}
          />
        ) : (
          <div
            className="size-10 shrink-0 rounded-full bg-zinc-200 cursor-pointer ring-2 ring-zinc-200 transition-all duration-200 hover:ring-indigo-400"
            onClick={() => router.push(`/profile/${post.user.id}`)}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="truncate text-sm font-semibold text-zinc-900 cursor-pointer transition-colors duration-200 hover:text-indigo-600"
              onClick={() => router.push(`/profile/${post.user.id}`)}
            >
              {post.user.username}
            </span>
            <span className="font-mono text-xs text-zinc-400">
              {new Date(post.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs text-zinc-400">• {post.views} просмотров</span>
            {canEditPost(post) && editingPost !== post.id && (
              <button
                onClick={() => { setEditingPost(post.id); setEditContent(post.content); }}
                className="flex items-center gap-1 text-xs text-zinc-400 transition-colors duration-200 hover:text-indigo-600"
              >
                <Edit2 className="size-3" /> Редактировать
              </button>
            )}
            {canDeletePost(post) && (
              <button
                onClick={() => handleDelete(post.id)}
                className="flex items-center gap-1 text-xs text-zinc-400 transition-colors duration-200 hover:text-red-600"
              >
                <Trash2 className="size-3" /> Удалить
              </button>
            )}
          </div>

          {editingPost === post.id ? (
            <div className="mt-2">
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                className="w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                rows={3} maxLength={1000}
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => handleEditPost(post.id)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-indigo-700 hover:scale-105 active:scale-95">
                  Сохранить
                </button>
                <button onClick={() => { setEditingPost(null); setEditContent(""); }}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-50">
                  <X className="size-3 inline" />
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-zinc-700">{post.content}</p>
          )}

          {post.mediaUrl && (
            <div className="mt-3 overflow-hidden rounded-xl bg-black/5 transition-all duration-300 hover:shadow-lg">
              {post.mediaType === "image" ? (
                <img src={post.mediaUrl} alt="Post media" className="w-full max-h-[80vh] object-contain transition-all duration-500 hover:scale-105" />
              ) : post.mediaType === "video" || post.mediaType === "circle" ? (
                <video src={post.mediaUrl} controls className="w-full max-h-[80vh] object-contain" />
              ) : null}
            </div>
          )}

          {post.repostOf && (
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 transition-all duration-200 hover:bg-zinc-100">
              <div className="flex items-center gap-2">
                <Repeat2 className="size-3 text-zinc-400" />
                <span className="text-xs text-zinc-500">Репост</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {post.repostOf.user.avatar ? (
                  <img src={post.repostOf.user.avatar} alt={post.repostOf.user.username}
                    className="size-5 rounded-full object-cover ring-1 ring-zinc-200" />
                ) : <div className="size-5 rounded-full bg-zinc-300" />}
                <span className="text-xs font-semibold text-zinc-900 cursor-pointer transition-colors duration-200 hover:text-indigo-600"
                  onClick={() => { if (post.repostOf) router.push(`/profile/${post.repostOf.user.id}`); }}>
                  {post.repostOf.user.username}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-700">{post.repostOf.content}</p>
            </div>
          )}

          {post.repostedComment && (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 transition-all duration-200 hover:bg-indigo-50">
              <div className="flex items-center gap-2">
                <MessageSquareMore className="size-3 text-indigo-400" />
                <span className="text-xs text-indigo-500">Репост комментария</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {post.repostedComment.user.avatar ? (
                  <img src={post.repostedComment.user.avatar} alt={post.repostedComment.user.username}
                    className="size-5 rounded-full object-cover ring-1 ring-indigo-200" />
                ) : <div className="size-5 rounded-full bg-indigo-200" />}
                <span className="text-xs font-semibold text-zinc-900 cursor-pointer transition-colors duration-200 hover:text-indigo-600"
                  onClick={() => {
                    if (post.repostedComment) {
                      router.push(`/profile/${post.repostedComment.user.id}`);
                    }
                  }}>
                  {post.repostedComment.user.username}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-700">{post.repostedComment.content}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                <Heart className="size-3" /> {post.repostedComment._count?.likes || 0}
              </div>
              {post.repostedComment.post && (
                <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-2">
                  <div className="flex items-center gap-2">
                    {post.repostedComment.post.user.avatar ? (
                      <img src={post.repostedComment.post.user.avatar} alt={post.repostedComment.post.user.username}
                        className="size-4 rounded-full object-cover" />
                    ) : <div className="size-4 rounded-full bg-zinc-200" />}
                    <span className="text-xs font-semibold text-zinc-900">{post.repostedComment.post.user.username}</span>
                    <span className="text-xs text-zinc-400">
                      {new Date(post.repostedComment.post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600">{post.repostedComment.post.content}</p>
                  {post.repostedComment.post.mediaUrl && (
                    <div className="mt-1 overflow-hidden rounded-lg">
                      {post.repostedComment.post.mediaType === 'image' ? (
                        <img src={post.repostedComment.post.mediaUrl} alt="Media" className="w-full max-h-32 object-contain" />
                      ) : (
                        <video src={post.repostedComment.post.mediaUrl} controls className="w-full max-h-32 object-contain" />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <ViewTracker postId={post.id} viewedPosts={viewedPosts} setViewedPosts={setViewedPosts} />

          <div className="mt-4 flex items-center gap-6">
            <button onClick={() => onLike(post.id)}
              className={`flex items-center gap-1.5 text-xs transition-all duration-200 ${likedPosts.has(post.id) ? "text-rose-500 scale-110" : "text-zinc-400 hover:text-rose-500 hover:scale-110"}`}>
              <Heart className={`size-4 transition-all duration-200 ${likedPosts.has(post.id) ? "fill-current animate-like" : ""}`} />
              {post.likes.length}
            </button>
            <button onClick={() => onToggleComments(post.id)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 transition-all duration-200 hover:text-indigo-600 hover:scale-110">
              <MessageCircle className="size-4" /> {post._count?.comments || 0}
            </button>
            <button onClick={() => onRepost(post)}
              className="flex items-center gap-1.5 text-xs text-zinc-400 transition-all duration-200 hover:text-green-600 hover:scale-110">
              <Repeat2 className="size-4" /> {post._count?.reposts || 0}
            </button>
          </div>

          <CommentSection
            postId={post.id}
            comments={comments[post.id] || []}
            expanded={expandedComments.has(post.id)}
            showAll={showAllComments.has(post.id)}
            onToggleExpand={() => onToggleComments(post.id)}
            onToggleShowAll={() => onToggleShowAll(post.id)}
            onAddComment={onAddComment}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            highlightedCommentId={highlightedCommentId}
          />
        </div>
      </div>
    </article>
  );
}
