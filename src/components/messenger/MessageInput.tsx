"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useToast } from "@/components/ToastProvider";
import { Send, Paperclip, X, FileText } from "lucide-react";

interface Props {
  onSend: (content: string, media?: { url: string; type: string; name: string }) => Promise<boolean>;
  onTyping?: () => void;
  replyTo?: {
    id: string;
    content: string;
    sender: { id: string; username: string };
  } | null;
  onCancelReply?: () => void;
  disabled?: boolean;
  otherOnline?: boolean;
  draftContent?: string;
}

export default function MessageInput({ onSend, onTyping, replyTo, onCancelReply, disabled, otherOnline, draftContent }: Props) {
  const { showAlert } = useToast();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [content, setContent] = useState("");

  // Обрабатываем draftContent (forwarded message)
  useEffect(() => {
    if (draftContent) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setContent(draftContent);
      if (inputRef.current) inputRef.current.focus();
    }
  }, [draftContent]);
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<{ url: string; type: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);
    // Debounced typing notification
    if (onTyping && e.target.value.trim()) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping();
      }, 300);
    }
  };

  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyTo]);

  useEffect(() => () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!content.trim() && !attachment) || disabled || uploading || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const sent = await onSend(content.trim(), attachment || undefined);
      if (sent) { setContent(''); setAttachment(null); }
    } finally { sendingRef.current = false; setSending(false); }

  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) { showAlert("Максимальный размер файла — 10 МБ"); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("purpose", "message");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAttachment({
          url: data.mediaUrl,
          type: data.mediaType,
          name: file.name,
        });
      } else {
        const data = await res.json();
        showAlert(data.error || "Не удалось загрузить файл");
      }
    } catch (err) {
      console.error("Failed to upload file:", err);
      showAlert("Нет соединения. Не удалось загрузить файл.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSubmit = (content.trim() || attachment) && !disabled && !uploading && !sending;

  return (
    <div className="border-t border-zinc-200 dark:border-white/10 px-4 py-4">
      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-white/10 animate-slideIn">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
              Ответ {replyTo.sender.username}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{replyTo.content}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-white/10 border border-zinc-200 dark:border-white/10 animate-slideIn">
          {attachment.type === "image" ? (
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-zinc-200 dark:bg-white/10">
              <Image
                src={attachment.url}
                alt="Превью"
                width={40}
                height={40}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
              <FileText className="size-5 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-zinc-700 dark:text-zinc-300 truncate font-medium">{attachment.name}</p>
          </div>
          <button
            onClick={() => setAttachment(null)}
            className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-3 relative">
        {/* Online status indicator */}
        {otherOnline && (
          <div className="absolute -top-2 left-2 flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-emerald-500">в сети</span>
          </div>
        )}
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || sending}
          className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center shrink-0 transition-all disabled:opacity-50"
          title="Прикрепить файл"
        >
          {uploading ? (
            <div className="size-4 animate-spin rounded-full border-2 border-zinc-400 border-t-indigo-500" />
          ) : (
            <Paperclip className="size-5 text-zinc-500 dark:text-zinc-400" />
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="min-w-0 flex-1 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-zinc-100 dark:bg-white/10 backdrop-blur-sm border border-zinc-200 dark:border-white/10 focus-within:border-indigo-500/50 transition-all">
          <input
            ref={inputRef}
            type="text"
            aria-label="Сообщение"
            maxLength={5000}
            placeholder="Написать сообщение..."
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled || sending}
            className="min-w-0 w-full flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 disabled:opacity-50"
          />
        </div>

        <button
          type="submit"
          aria-label="Отправить сообщение"
          disabled={!canSubmit}
          className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 transition-all hover:scale-110 hover:animate-ripple disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-indigo-500/25"
        >
          <Send className="size-5" />
        </button>
      </form>
    </div>
  );
}
