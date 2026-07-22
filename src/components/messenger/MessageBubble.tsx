"use client";

import { useState } from "react";
import { CheckCheck, Trash2, Reply, FileText, Pencil, SmilePlus, Pin } from "lucide-react";
import Avatar from "@/components/Avatar";

interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; username: string };
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    avatar: string | null;
  };
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaName?: string | null;
  replyTo?: {
    id: string;
    content: string;
    senderId: string;
    sender: { id: string; username: string };
  } | null;
  reactions?: MessageReaction[];
  editedAt?: string | null;
  pinnedBy?: { id: string } | null;
}

const EMOJI_LIST = ["\u2764\ufe0f", "\ud83d\ude02", "\ud83d\ude2e", "\ud83d\ude22", "\ud83d\udc4d", "\ud83d\udd25"];

interface Props {
  message: Message;
  isOwn: boolean;
  onDelete?: (id: string) => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onPin?: (messageId: string) => void;
  stagger?: number;
}

export default function MessageBubble({ message, isOwn, onDelete, onReply, onReact, onEdit, onPin, stagger = 1 }: Props) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && editContent !== message.content) {
      onEdit?.(message.id, editContent.trim());
    }
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === "Escape") {
      setIsEditing(false);
      setEditContent(message.content);
    }
  };

  // Group reactions by emoji
  const groupedReactions = (message.reactions || []).reduce<Record<string, MessageReaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  return (
    <div
      className={`flex items-end gap-2.5 group message-enter ${
        isOwn ? "justify-end" : "justify-start"
      }`}
      style={{ animationDelay: `${Math.min(stagger * 0.04, 0.3)}s` }}
      onMouseEnter={() => { setShowActions(true); setShowEmojiPicker(false); }}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar for received messages */}
      {!isOwn && (
        <Avatar id={message.sender.id} name={message.sender.username} size={8} round />
      )}

      <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {/* Reply preview */}
        {message.replyTo && (
          <div
            className={`mb-1 px-3 py-1.5 rounded-xl text-[11px] max-w-[200px] ${
              isOwn
                ? "bg-indigo-500/30 text-indigo-100 dark:text-indigo-200 rounded-br-none"
                : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 rounded-bl-none"
            }`}
          >
            <p className="font-medium text-[10px] opacity-70 mb-0.5">
              {message.replyTo.sender.username}
            </p>
            <p className="truncate">{message.replyTo.content}</p>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`relative px-4 py-3 ${
            isOwn ? "message-sent" : "message-received"
          }`}
        >
          {/* Media attachment */}
          {message.mediaUrl && message.mediaType === "image" && (
            <div className="mb-2 -mx-4 -mt-3 overflow-hidden rounded-t-[18px] bg-zinc-100 dark:bg-zinc-800">
              <img
                src={message.mediaUrl}
                alt="\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435"
                className="w-full max-h-64 object-contain"
                loading="lazy"
              />
            </div>
          )}
          {message.mediaUrl && message.mediaType === "video" && (
            <div className="mb-2 -mx-4 -mt-3 overflow-hidden rounded-t-[18px]">
              <video
                src={message.mediaUrl}
                controls
                className="w-full max-h-64"
                preload="metadata"
              />
            </div>
          )}
          {message.mediaUrl && message.mediaType === "file" && (
            <div className={`mb-2 -mx-4 -mt-3 px-4 pt-3 pb-2 ${isOwn ? "bg-indigo-500/20" : "bg-zinc-100 dark:bg-white/10"} border-b border-white/10`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                  <FileText className="size-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={message.mediaName || "\u0424\u0430\u0439\u043b"}>{message.mediaName ? message.mediaName.substring(0, 10) + (message.mediaName.length > 10 ? "\u2026" : "") : "\u0424\u0430\u0439\u043b"}</p>
                  <p className="text-[10px] opacity-60">\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435</p>
                </div>
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-white border-b border-indigo-500/50 pb-0.5"
                autoFocus
                onBlur={handleSaveEdit}
              />
              <span className="text-[10px] text-zinc-400 shrink-0">Enter \u2014 \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c</span>
            </div>
          ) : (
            message.content && (
              <p className="text-sm leading-relaxed text-zinc-900 dark:text-white">{message.content}</p>
            )
          )}

          <div
            className={`flex items-center gap-1.5 mt-1.5 ${
              isOwn ? "justify-end" : "justify-start"
            }`}
          >
            {message.pinnedBy && (
              <Pin className="size-2.5 text-amber-500" />
            )}
            <span className="text-[10px] text-zinc-500/70 dark:text-white/60">{formatTime(message.createdAt)}</span>
            {message.editedAt && (
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 italic">(\u0438\u0437\u043c\u0435\u043d\u0435\u043d\u043e)</span>
            )}
            {isOwn && (
              <CheckCheck className="size-3 text-zinc-500/80 dark:text-white/80" />
            )}
          </div>
        </div>

        {/* Reactions row */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(groupedReactions).map(([emoji, reactors]) => (
              <button
                key={emoji}
                onClick={() => onReact?.(message.id, emoji)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-white/10 text-xs hover:bg-zinc-200 dark:hover:bg-white/20 transition-all"
                title={reactors.map((r) => r.user.username).join(", ")}
              >
                <span>{emoji}</span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">{reactors.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions (hover) */}
        <div
          className={`flex gap-1 mt-1 transition-all duration-300 ease-out ${
            isOwn ? "justify-end" : "justify-start"
          } ${
            showActions
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-1 pointer-events-none"
          }`}
        >
          {onReact && (
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
                title="\u0420\u0435\u0430\u043a\u0446\u0438\u044f"
              >
                <SmilePlus className="size-3" />
              </button>
              {showEmojiPicker && (
                <div className={`absolute bottom-full mb-1 flex gap-1 p-1.5 rounded-xl bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 z-10 ${isOwn ? 'right-0' : 'left-0'}`}>
                  {EMOJI_LIST.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => { onReact(message.id, emoji); setShowEmojiPicker(false); }}
                      className="w-7 h-7 flex items-center justify-center text-sm hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-all hover:scale-125"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {onReply && (
            <button
              onClick={() => onReply(message)}
              className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
              title="\u041e\u0442\u0432\u0435\u0442\u0438\u0442\u044c"
            >
              <Reply className="size-3" />
            </button>
          )}
          {isOwn && onEdit && !isEditing && (
            <button
              onClick={() => { setIsEditing(true); setEditContent(message.content); }}
              className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
              title="\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c"
            >
              <Pencil className="size-3" />
            </button>
          )}
          {isOwn && onPin && (
            <button
              onClick={() => onPin(message.id)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 ${
                message.pinnedBy
                  ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                  : "bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-500"
              }`}
              title={message.pinnedBy ? "Открепить" : "Закрепить"}
            >
              <Pin className="size-3" />
            </button>
          )}
          {isOwn && onDelete && (
            <button
              onClick={() => onDelete(message.id)}
              className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/40 flex items-center justify-center transition-all duration-200 hover:scale-110"
              title="\u0423\u0434\u0430\u043b\u0438\u0442\u044c"
            >
              <Trash2 className="size-3 text-red-500 dark:text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Spacer for own messages */}
      {isOwn && <div className="w-2" />}
    </div>
  );
}
