"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Paperclip, X } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

interface PostFormProps {
  onPostCreated: () => void;
}

export default function PostForm({ onPostCreated }: PostFormProps) {
  const [newPostContent, setNewPostContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showAlert } = useToast();

  useEffect(() => {
    return () => { if (mediaPreview) URL.revokeObjectURL(mediaPreview); };
  }, [mediaPreview]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showAlert("Файл слишком большой. Максимум 10 MB");
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"];
    if (!allowedTypes.includes(file.type)) {
      showAlert("Неподдерживаемый формат. Разрешены: JPEG, PNG, GIF, WebP, MP4, WebM");
      return;
    }
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
      setMediaPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || (!newPostContent.trim() && !mediaFile)) return;
    setIsLoading(true);
    try {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;

      if (mediaFile) {
        setIsUploading(true);
        const uploadFormData = new FormData();
        uploadFormData.append("file", mediaFile);
        uploadFormData.append("purpose", "post");
        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: uploadFormData,
        });
        if (!uploadResponse.ok) {
          const err = await uploadResponse.json();
          showAlert(err.error || "Ошибка загрузки файла");
          setIsLoading(false);
          setIsUploading(false);
          return;
        }
        const uploadData = await uploadResponse.json();
        mediaUrl = uploadData.mediaUrl;
        mediaType = uploadData.mediaType;
        setIsUploading(false);
      }

      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newPostContent, mediaUrl, mediaType }),
      });

      if (response.ok) {
        setNewPostContent("");
        handleRemoveMedia();
        onPostCreated();
      } else {
        const data = await response.json();
        showAlert(data.error || "Не удалось опубликовать пост. Попробуй ещё раз.");
      }
    } catch (error) {
      console.error("Failed to create post:", error);
      showAlert("Нет соединения. Твой текст сохранён — попробуй ещё раз.");
    } finally {
      setIsUploading(false);
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="post-composer mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-indigo-500/20">
      <div className="composer-heading">Что у тебя нового? <span>Твоя волна начинается здесь</span></div>
      <textarea
        aria-label="Текст нового поста"
        value={newPostContent}
        onChange={(e) => setNewPostContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            handleSubmit(e);
          }
        }}
        placeholder="Мысль, история или тот самый мем…"
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500 dark:text-zinc-100"
        rows={3}
        maxLength={1000}
      />
      <div className="mt-1 flex justify-end">
        <span
          className={`text-xs transition-colors duration-200 ${
            newPostContent.length > 1000
              ? "text-red-500 font-medium"
              : newPostContent.length > 900
              ? "text-amber-500"
              : "text-zinc-400 dark:text-zinc-500"
          }`}
        >
          {newPostContent.length}/1000
        </span>
      </div>

      {mediaPreview && (
        <div className="relative mt-3 overflow-hidden rounded-xl bg-black/5">
          {mediaFile?.type.startsWith("video/") ? (
            <video src={mediaPreview} className="w-full max-h-64 object-contain" />
          ) : (
            <Image
              src={mediaPreview}
              alt="Preview"
              width={400}
              height={300}
              className="w-full max-h-64 object-contain"
              unoptimized
            />
          )}
          <button
            type="button"
            onClick={handleRemoveMedia}
            aria-label="Удалить вложение"
            className="absolute top-2 right-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70 transition-all duration-200"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
              mediaFile ? "text-indigo-600 dark:text-indigo-400" : "text-zinc-500 dark:text-zinc-400"
            }`}
          >
            <Paperclip className="size-4" />
            {mediaFile ? mediaFile.name : "Медиа"}
          </button>
        </div>
        <button
          type="submit"
          disabled={isLoading || isUploading || (!newPostContent.trim() && !mediaFile)}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-all duration-200 hover:bg-indigo-700 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isUploading ? "Загрузка..." : isLoading ? "Публикация..." : "Опубликовать"}
        </button>
      </div>
    </form>
  );
}
