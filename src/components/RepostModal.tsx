"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Repeat2, MessageCircle, Heart } from "lucide-react";
import Avatar from "@/components/Avatar";
import { useToast } from "@/components/ToastProvider";

interface Post {
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
  likes: Array<{ userId: string }>;
  _count?: {
    likes: number;
    comments: number;
    reposts?: number;
  };
}

interface RepostModalProps {
  post: Post;
  onClose: () => void;
  onReposted: () => void;
}

export default function RepostModal({ post, onClose, onReposted }: RepostModalProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast, showAlert } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/posts/${post.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });

      if (response.ok) {
        showToast("Репост опубликован", "success");
        onReposted();
        onClose();
      } else {
        const data = await response.json();
        showAlert(data.error || "Ошибка при репосте");
      }
    } catch (error) {
      console.error("Failed to repost:", error);
      showAlert("Ошибка при репосте");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="mx-4 w-full max-w-lg animate-pop rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Репост</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 hover:text-zinc-600"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {/* Комментарий */}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Добавьте комментарий к репосту..."
            className="w-full resize-none rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            rows={3}
            maxLength={1000}
          />

          {/* Оригинальный пост */}
          <div className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3">
            <div className="flex items-center gap-2">
              <Avatar id={post.user.id} src={post.user.avatar} name={post.user.username} size={6} />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{post.user.username}</span>
              <span className="text-xs text-zinc-400">
                {new Date(post.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{post.content}</p>
            {post.mediaUrl && (
              <div className="mt-2 overflow-hidden rounded-lg">
                {post.mediaType === "image" ? (
                  <Image src={post.mediaUrl} alt="Media" width={400} height={300} className="w-full max-h-48 object-contain" />
                ) : (
                  <video src={post.mediaUrl} controls className="w-full max-h-48 object-contain" />
                )}
              </div>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Heart className="size-3" /> {post.likes.length}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="size-3" /> {post._count?.comments || 0}
              </span>
              <span className="flex items-center gap-1">
                <Repeat2 className="size-3" /> {post._count?.reposts || 0}
              </span>
            </div>
          </div>

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
