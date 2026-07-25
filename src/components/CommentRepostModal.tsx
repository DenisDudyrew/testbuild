"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Repeat2, MessageCircle, Heart, MessageSquareMore } from "lucide-react";
import Avatar from "@/components/Avatar";
import { useToast } from "@/components/ToastProvider";

interface CommentRepostComment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatar: string | null;
  };
  likes: Array<{ userId: string }>;
  _count?: { likes: number };
  postId?: string;
  post?: {
    id: string;
    content: string;
    mediaUrl: string | null;
    mediaType: string | null;
    createdAt: string;
    user: {
      id: string;
      username: string;
      avatar: string | null;
    };
  } | null;
}

interface CommentRepostModalProps {
  comment: CommentRepostComment;
  onClose: () => void;
  onReposted: () => void;
}

export default function CommentRepostModal({ comment, onClose, onReposted }: CommentRepostModalProps) {
  const [repostComment, setRepostComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast, showAlert } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/comments/${comment.id}/repost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: repostComment }),
      });

      if (response.ok) {
        showToast("Комментарий репостнут в ленту", "success");
        onReposted();
        onClose();
      } else {
        const data = await response.json();
        showAlert(data.error || "Ошибка при репосте");
      }
    } catch (error) {
      console.error("Failed to repost comment:", error);
      showAlert("Ошибка при репосте");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg animate-pop rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Репост комментария</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-600"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {/* Комментарий пользователя */}
          <textarea
            value={repostComment}
            onChange={(e) => setRepostComment(e.target.value)}
            placeholder="Добавьте комментарий к репосту..."
            className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            rows={3}
            maxLength={1000}
          />

          {/* Репостнутый комментарий */}
          <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex items-center gap-2">
              <MessageSquareMore className="size-3 text-indigo-400" />
              <span className="text-xs text-indigo-500">Комментарий</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Avatar id={comment.user.id} src={comment.user.avatar} name={comment.user.username} size={5} />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{comment.user.username}</span>
              <span className="text-xs text-zinc-400">
                {new Date(comment.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{comment.content}</p>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-400">
              <Heart className="size-3" /> {comment._count?.likes || comment.likes?.length || 0}
            </div>
          </div>

          {/* Исходный пост, если есть */}
          {comment.post && (
            <div className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-3 text-zinc-400" />
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Оригинальный пост</span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Avatar id={comment.post.user.id} src={comment.post.user.avatar} name={comment.post.user.username} size={5} />
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{comment.post.user.username}</span>
                <span className="text-xs text-zinc-400">
                  {new Date(comment.post.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{comment.post.content}</p>
              {comment.post.mediaUrl && (
                <div className="mt-2 overflow-hidden rounded-lg">
                  {comment.post.mediaType === "image" ? (
                    <Image src={comment.post.mediaUrl} alt="Media" width={400} height={300} className="w-full max-h-48 object-contain" />
                  ) : (
                    <video src={comment.post.mediaUrl} controls className="w-full max-h-48 object-contain" />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Кнопки */}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Repeat2 className="size-4" />
              {isSubmitting ? "Репост..." : "Репостнуть"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
