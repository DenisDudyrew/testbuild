"use client";

import { useState } from "react";
import { X, Heart, Repeat2 } from "lucide-react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import CommentRepostModal from "@/components/CommentRepostModal";
import type { Comment, CommentReply } from "@/types/post";

interface CommentSectionProps {
  postId: string;
  comments: Comment[];
  expanded: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  onAddComment: (postId: string, content: string, parentId?: string) => void;
  replyingTo: { commentId: string; username: string } | null;
  setReplyingTo: (val: { commentId: string; username: string } | null) => void;
  highlightedCommentId?: string | null;
}

export default function CommentSection({
  postId,
  comments,
  expanded,
  showAll,
  onToggleShowAll,
  onAddComment,
  replyingTo,
  setReplyingTo,
  highlightedCommentId,
}: CommentSectionProps) {
  if (!expanded) return null;

  const displayComments = showAll ? comments : comments?.slice(0, 5);

  return (
    <div className="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4 animate-fadeIn">
      <div className="space-y-3">
        {displayComments?.map((comment: Comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            postId={postId}
            onReply={(id, username) => setReplyingTo({ commentId: id, username })}
            isHighlighted={highlightedCommentId === comment.id}
          />
        ))}
      </div>

      {comments && comments.length > 5 && (
        <button
          onClick={onToggleShowAll}
          className="mt-2 text-xs text-indigo-600 transition-colors duration-200 hover:text-indigo-700"
        >
          {showAll
            ? `Скрыть ${comments.length - 5} комментариев`
            : `Показать ещё ${comments.length - 5} комментариев`}
        </button>
      )}

      <CommentForm
        postId={postId}
        onAddComment={onAddComment}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}

function CommentItem({
  comment,
  onReply,
  isHighlighted,
}: {
  comment: Comment;
  postId: string;
  onReply: (id: string, username: string) => void;
  isHighlighted?: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(
    comment.likes?.some((l) => l.userId === "current") || false
  );
  const [likeCount, setLikeCount] = useState(comment._count?.likes || comment.likes?.length || 0);
  const [repostComment, setRepostComment] = useState<Comment | null>(null);

  const handleLike = async () => {
    try {
      const res = await fetch(`/api/comments/${comment.id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount((prev) => (data.liked ? prev + 1 : prev - 1));
      }
    } catch {}
  };

  const handleRepost = () => {
    setRepostComment(comment);
  };

  return (
    <div
      className={`flex gap-2 transition-all duration-300 ${
        isHighlighted ? "animate-highlight" : ""
      }`}
    >
      <Avatar
        id={comment.user.id}
        src={comment.user.avatar}
        name={comment.user.username}
        size={6}
        onClick={() => router.push(`/profile/${comment.user.id}`)}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer transition-colors duration-200 hover:text-indigo-600"
            onClick={() => router.push(`/profile/${comment.user.id}`)}
          >
            {comment.user.username}
          </span>
          <span className="text-xs text-zinc-400">
            {new Date(comment.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="text-xs text-zinc-700 dark:text-zinc-300">{comment.content}</p>
        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={() => onReply(comment.id, comment.user.username)}
            className="text-xs text-indigo-600 transition-colors duration-200 hover:text-indigo-700"
          >
            Ответить
          </button>
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs transition-all duration-200 ${
              liked ? "text-rose-500" : "text-zinc-400 hover:text-rose-500 hover:scale-110"
            }`}
          >
            <Heart className={`size-3 transition-all duration-200 ${liked ? "fill-current animate-like" : ""}`} />
            {likeCount}
          </button>
          <button
            onClick={handleRepost}
            className="flex items-center gap-1 text-xs text-zinc-400 transition-all duration-200 hover:text-green-600 hover:scale-110"
          >
            <Repeat2 className="size-3" />
          </button>
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="ml-4 mt-2 space-y-2">
            {comment.replies.map((reply: CommentReply) => (
              <ReplyItem key={reply.id} reply={reply} onReply={onReply} />
            ))}
          </div>
        )}
      </div>

      {repostComment && (
        <CommentRepostModal
          comment={repostComment}
          onClose={() => setRepostComment(null)}
          onReposted={() => {
            setRepostComment(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function ReplyItem({
  reply,
  onReply,
}: {
  reply: CommentReply;
  onReply: (id: string, username: string) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(
    reply.likes?.some((l: { userId: string }) => l.userId === "current") || false
  );
  const [likeCount, setLikeCount] = useState(reply._count?.likes || reply.likes?.length || 0);
  const [repostComment, setRepostComment] = useState<CommentReply | null>(null);

  const handleLike = async () => {
    try {
      const res = await fetch(`/api/comments/${reply.id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount((prev: number) => (data.liked ? prev + 1 : prev - 1));
      }
    } catch {}
  };

  const handleRepost = () => {
    setRepostComment(reply);
  };

  return (
    <div className="flex gap-2">
      <Avatar
        id={reply.user.id}
        src={reply.user.avatar}
        name={reply.user.username}
        size={5}
        onClick={() => router.push(`/profile/${reply.user.id}`)}
      />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 cursor-pointer transition-colors duration-200 hover:text-indigo-600"
            onClick={() => router.push(`/profile/${reply.user.id}`)}
          >
            {reply.user.username}
          </span>
          <span className="text-xs text-zinc-400">
            {new Date(reply.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p className="text-xs text-zinc-700 dark:text-zinc-300">{reply.content}</p>
        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={() => onReply(reply.id, reply.user.username)}
            className="text-xs text-indigo-600 transition-colors duration-200 hover:text-indigo-700"
          >
            Ответить
          </button>
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs transition-all duration-200 ${
              liked ? "text-rose-500" : "text-zinc-400 hover:text-rose-500 hover:scale-110"
            }`}
          >
            <Heart className={`size-3 transition-all duration-200 ${liked ? "fill-current animate-like" : ""}`} />
            {likeCount}
          </button>
          <button
            onClick={handleRepost}
            className="flex items-center gap-1 text-xs text-zinc-400 transition-all duration-200 hover:text-green-600 hover:scale-110"
          >
            <Repeat2 className="size-3" />
          </button>
        </div>

        {repostComment && (
          <CommentRepostModal
            comment={repostComment}
            onClose={() => setRepostComment(null)}
            onReposted={() => {
              setRepostComment(null);
              window.location.reload();
            }}
          />
        )}
      </div>
    </div>
  );
}

function CommentForm({
  postId,
  onAddComment,
  replyingTo,
  onCancelReply,
}: {
  postId: string;
  onAddComment: (postId: string, content: string, parentId?: string) => void;
  replyingTo: { commentId: string; username: string } | null;
  onCancelReply: () => void;
}) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setIsSubmitting(true);
    onAddComment(postId, comment, replyingTo?.commentId);
    setComment("");
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3">
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-950 px-3 py-2 animate-fadeIn">
          <span className="text-xs text-zinc-600 dark:text-zinc-400">
            Ответ на <span className="font-semibold">{replyingTo.username}</span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="text-xs text-zinc-400 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-400"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              handleSubmit(e);
            }
          }}
          placeholder={
            replyingTo ? `Ответить ${replyingTo.username}...` : "Написать комментарий..."
          }
          className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-xs outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={isSubmitting || !comment.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-indigo-700 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isSubmitting ? "..." : "Отправить"}
        </button>
      </div>
    </form>
  );
}
