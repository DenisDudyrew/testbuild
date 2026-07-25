"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { CheckCheck, Trash2, Reply, FileText, Pencil, SmilePlus, Pin, Forward, Info, Copy, X } from "lucide-react";
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
  deletedAt?: string | null;
  deletedForUserId?: string | null;
  forwardFrom?: {
    id: string;
    content: string;
    senderId: string;
    sender: { id: string; username: string };
  } | null;
  deliveryStatus?: string; // "sent" | "delivered" | "read"
  editHistory?: { id: string; oldContent: string; editedAt: string }[];
}

const EMOJI_LIST = ["\u2764\ufe0f", "\ud83d\ude02", "\ud83d\ude2e", "\ud83d\ude22", "\ud83d\udc4d", "\ud83d\udd25"];

interface Props {
  message: Message;
  isOwn: boolean;
  onDelete?: (id: string, mode?: 'forMe' | 'forEveryone') => void;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onPin?: (messageId: string) => void;
  onForward?: (message: Message) => void;
  stagger?: number;
}

export default function MessageBubble({ message, isOwn, onDelete, onReply, onReact, onEdit, onPin, onForward, stagger = 1 }: Props) {
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [showEditHistory, setShowEditHistory] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const touchPosRef = useRef<{ x: number; y: number } | null>(null);

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

  const handleContextMenu = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    let x = 0, y = 0;
    if ('touches' in e && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else if ('clientX' in e) {
      x = e.clientX;
      y = e.clientY;
    }
    // Adjust to keep menu within viewport
    const menuWidth = 180;
    const menuHeight = 300;
    const maxX = window.innerWidth - menuWidth - 16;
    const maxY = window.innerHeight - menuHeight - 16;
    setContextMenuPos({ x: Math.min(x, Math.max(maxX, 0)), y: Math.min(y, Math.max(maxY, 0)) });
    setShowContextMenu(true);
  }, []);

  return (
    <div
      ref={messageRef}
      className={`flex items-end gap-2.5 group message-enter ${
        isOwn ? "justify-end" : "justify-start"
      }`}
      style={{ animationDelay: `${Math.min(stagger * 0.04, 0.3)}s` }}
      onMouseEnter={() => { setShowActions(true); setShowEmojiPicker(false); }}
      onMouseLeave={() => setShowActions(false)}
      onContextMenu={handleContextMenu}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        touchPosRef.current = { x: touch.clientX, y: touch.clientY };
        longPressTimer.current = setTimeout(() => {
          if (touchPosRef.current) {
            const pos = touchPosRef.current;
            const menuWidth = 180;
            const menuHeight = 300;
            const maxX = window.innerWidth - menuWidth - 16;
            const maxY = window.innerHeight - menuHeight - 16;
            setContextMenuPos({ x: Math.min(pos.x, Math.max(maxX, 0)), y: Math.min(pos.y, Math.max(maxY, 0)) });
            setShowContextMenu(true);
          }
        }, 500);
      }}
      onTouchEnd={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
      onTouchMove={() => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }}
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
              <Image
                src={message.mediaUrl}
                alt="Изображение"
                width={400}
                height={300}
                className="w-full max-h-64 object-contain"
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
              message.deliveryStatus === "read" ? (
                <CheckCheck className="size-3 text-blue-500" />
              ) : message.deliveryStatus === "delivered" ? (
                <CheckCheck className="size-3 text-zinc-500/80 dark:text-white/80" />
              ) : (
                <CheckCheck className="size-3 text-zinc-400/60 dark:text-white/60" />
              )
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
              onClick={() => onDelete(message.id, 'forEveryone')}
              className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/40 flex items-center justify-center transition-all duration-200 hover:scale-110"
              title="\u0423\u0434\u0430\u043b\u0438\u0442\u044c"
            >
              <Trash2 className="size-3 text-red-500 dark:text-red-400" />
            </button>
          )}
        </div>
        {/* Forward button */}
        {onForward && (
          <button
            onClick={() => onForward(message)}
            className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
            title="Переслать"
          >
            <Forward className="size-3" />
          </button>
        )}
        {isOwn && message.editedAt && message.editHistory && message.editHistory.length > 0 && (
          <button
            onClick={() => setShowEditHistory(!showEditHistory)}
            className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110"
            title="История изменений"
          >
            <Info className="size-3" />
          </button>
        )}
      </div>

      {/* Context Menu (long-press / right-click) */}
      {showContextMenu && contextMenuPos && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 p-2 min-w-[180px]"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
        >
          <button
            onClick={() => { onReply?.(message); setShowContextMenu(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm text-left transition-all"
          >
            <Reply className="size-4" /> Ответить
          </button>
          {onReact && (
            <>
              {showEmojiMenu ? (
                <div className="flex flex-wrap gap-1 p-2 pb-1">
                  <div className="w-full text-[10px] text-zinc-400 dark:text-zinc-500 mb-1 font-medium">Выберите реакцию</div>
                  <div className="flex gap-1 flex-wrap">
                    {EMOJI_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => { onReact(message.id, emoji); setShowContextMenu(false); setShowEmojiMenu(false); }}
                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-zinc-100 dark:hover:bg-white/10 rounded-lg transition-all hover:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowEmojiMenu(true)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm text-left transition-all"
                >
                  <SmilePlus className="size-4" /> Реакция
                </button>
              )}
            </>
          )}
          {onForward && (
            <button
              onClick={() => { onForward(message); setShowContextMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm text-left transition-all"
            >
              <Forward className="size-4" /> Переслать
            </button>
          )}
          <button
            onClick={() => { navigator.clipboard.writeText(message.content); setShowContextMenu(false); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm text-left transition-all"
          >
            <Copy className="size-4" /> Копировать
          </button>
          {isOwn && onDelete && (
            <>
              <div className="h-px bg-zinc-200 dark:bg-white/10 my-1" />
              <button
                onClick={() => { onDelete(message.id, 'forEveryone'); setShowContextMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 text-sm text-left text-red-600 dark:text-red-400 transition-all"
              >
                <Trash2 className="size-4" /> Удалить для всех
              </button>
              <button
                onClick={() => { onDelete(message.id, 'forMe'); setShowContextMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 text-sm text-left text-red-600 dark:text-red-400 transition-all"
              >
                <X className="size-4" /> Удалить для себя
              </button>
            </>
          )}
          <button
            onClick={() => setShowContextMenu(false)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm text-left transition-all mt-1"
          >
            <X className="size-4" /> Отмена
          </button>
        </div>
      )}

      {/* Delete menu */}
      {showDeleteMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowDeleteMenu(false)}>
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-4 min-w-[240px]" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-3 text-center">Удалить сообщение</p>
            <button
              onClick={() => { onDelete?.(message.id, 'forEveryone'); setShowDeleteMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 text-sm text-red-600 dark:text-red-400 transition-all"
            >
              <Trash2 className="size-4" /> Удалить для всех
            </button>
            <button
              onClick={() => { onDelete?.(message.id, 'forMe'); setShowDeleteMenu(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 text-sm text-red-600 dark:text-red-400 transition-all"
            >
              <X className="size-4" /> Удалить для себя
            </button>
            <button
              onClick={() => setShowDeleteMenu(false)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm transition-all mt-2"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Edit history */}
      {showEditHistory && message.editHistory && message.editHistory.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowEditHistory(false)}>
          <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl p-4 min-w-[280px] max-w-sm max-h-64 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-3">История изменений</p>
            {message.editHistory.map((entry) => (
              <div key={entry.id} className="mb-2 p-2 rounded-xl bg-zinc-50 dark:bg-white/10">
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-0.5">
                  {new Date(entry.editedAt).toLocaleString("ru-RU")}
                </p>
                <p className="text-sm">{entry.oldContent}</p>
              </div>
            ))}
            <button
              onClick={() => setShowEditHistory(false)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/10 text-sm transition-all mt-2"
            >
              <X className="size-4" /> Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Spacer for own messages */}
      {isOwn && <div className="w-2" />}
    </div>
  );
}
