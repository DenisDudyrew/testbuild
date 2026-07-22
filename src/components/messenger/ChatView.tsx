"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, Pin, Image as ImageIcon, X, Loader2, Grid3X3 } from "lucide-react";
import Avatar from "@/components/Avatar";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { useSocket } from "@/lib/socket-client";


const POLL_INTERVAL = 5000;
const POST_DEBOUNCE_MS = 2000;
const TYPING_POLL_INTERVAL = 4000;
let localIdCounter = 0;


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

interface Participant {
  id: string;
  username: string;
  avatar: string | null;
  lastSeenAt?: string | null;
}

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  participants: Participant[];
}

interface Props {
  conversation: Conversation;
  onBack?: () => void;
  showBack?: boolean;
}

export default function ChatView({ conversation, onBack, showBack }: Props) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ id: string; username: string }[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaItems, setMediaItems] = useState<{ id: string; mediaUrl: string; mediaType: string }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPollRef = useRef(0);
  const isSendingRef = useRef(false);
  const isTypingRef = useRef(false);

  const socket = useSocket(session?.user?.id, {
    onMessageNew: (message) => {
      setMessages((prev) => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
    },
    onTypingUpdate: (data) => {
      if (data.conversationId === conversation.id) {
        setTypingUsers(data.typing);
      }
    },
  });

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/messenger/conversations/${conversation.id}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
        if (data.pinnedMessages) {
          setPinnedMessages(data.pinnedMessages);
        }
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  const fetchTypingStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/messenger/conversations/${conversation.id}/typing`);
      if (res.ok) {
        const data = await res.json();
        setTypingUsers(data.typing);
      }
    } catch {
      // silent
    }
  }, [conversation.id]);

  const handleTyping = useCallback(() => {
    if (socket.connected) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socket.sendTyping(conversation.id, session?.user?.id || '', session?.user?.name || '');
        setTimeout(() => { isTypingRef.current = false; }, 4000);
      }
    } else {
      fetch(`/api/messenger/conversations/${conversation.id}/typing`, {
        method: "POST",
      }).catch(() => {});
    }
  }, [conversation.id, session, socket]);

  useEffect(() => {
    lastPollRef.current = Date.now();
  }, [conversation.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setReplyTo(null);
    fetchMessages();

    socket.joinConversation(conversation.id);

    // Fallback polling (если Socket.IO не работает)
    const interval = setInterval(() => {
      if (socket.connected) return;
      if (isSendingRef.current) return;
      if (Date.now() - lastPollRef.current < POST_DEBOUNCE_MS) return;
      fetchMessages();
    }, POLL_INTERVAL);

    const typingInterval = setInterval(() => {
      if (socket.connected) return;
      fetchTypingStatus();
    }, TYPING_POLL_INTERVAL);

    return () => {
      clearInterval(interval);
      clearInterval(typingInterval);
      socket.leaveConversation(conversation.id);
    };
  }, [conversation.id, fetchMessages, fetchTypingStatus, socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleReact = async (messageId: string, emoji: string) => {
    try {
      await fetch(`/api/messenger/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  };

  const handleEdit = async (messageId: string, content: string) => {
    try {
      await fetch(`/api/messenger/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error("Failed to edit message:", err);
    }
  };

  const handleSend = async (content: string, media?: { url: string; type: string; name: string }) => {
    if (isSendingRef.current) return;

    isSendingRef.current = true;

    // Optimistic UI: добавляем сообщение локально сразу
    localIdCounter += 1;
    const tempId = `temp-${localIdCounter}`;
    const tempMessage: Message = {
      id: tempId,
      content,
      createdAt: new Date().toISOString(),
      senderId: session?.user?.id || '',
      sender: {
        id: session?.user?.id || '',
        username: session?.user?.name || 'me',
        avatar: null,
      },
      mediaUrl: media?.url || null,
      mediaType: media?.type || null,
      replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderId: replyTo.senderId, sender: replyTo.sender } : null,
    };
    setMessages((prev) => [...prev, tempMessage]);
    setReplyTo(null);

    try {
      const res = await fetch(`/api/messenger/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          replyToId: replyTo?.id || null,
          mediaUrl: media?.url || null,
          mediaType: media?.type || null,
          mediaName: media?.name || null,
        }),
      });

      if (res.ok) {
        lastPollRef.current = Date.now();
        const data = await res.json();
        // Отправляем через Socket.IO для real-time
        socket.sendMessage(conversation.id, data);
      } else {
        // Ошибка — убираем локальное сообщение
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      isSendingRef.current = false;
    }
  };

  const handlePin = async (messageId: string) => {
    try {
      await fetch(`/api/messenger/conversations/${conversation.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  };

  const handleDelete = async (messageId: string) => {
    try {
      await fetch(`/api/messenger/conversations/${conversation.id}/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const fetchMedia = async () => {
    setMediaLoading(true);
    try {
      const res = await fetch(`/api/messenger/conversations/${conversation.id}/media`);
      if (res.ok) {
        const data = await res.json();
        setMediaItems(data.media || []);
      }
    } catch {
      // ignore
    } finally {
      setMediaLoading(false);
    }
  };

  const isOnline = useCallback((lastSeenAt?: string | null): boolean => {
    if (!lastSeenAt) return false;
    return Date.now() - new Date(lastSeenAt).getTime() < 120000;
  }, []);

  const getChatName = (): string => {
    if (conversation.name) return conversation.name;
    const others = conversation.participants.filter(p => p.id !== session?.user?.id);
    return others.map(p => p.username).join(", ") || "Чат";
  };

  const chatName = getChatName();

  const otherParticipant = conversation.participants.find(p => p.id !== session?.user?.id);
  const otherOnline = otherParticipant ? isOnline(otherParticipant.lastSeenAt) : false;

  const formatLastSeen = (lastSeenAt?: string | null): string => {
    if (!lastSeenAt) return "";
    const date = new Date(lastSeenAt);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 120000) return "в сети";
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `был(а) в сети ${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `был(а) в сети ${hours} ч назад`;
    return `был(а) в сети ${date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <div className="relative">
            <Avatar id={conversation.id} name={chatName} size={11} round />
            {otherParticipant && otherOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{getChatName()}</h3>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {otherParticipant
                ? formatLastSeen(otherParticipant.lastSeenAt)
                : (() => {
                    const n = conversation.participants.length;
                    if (n % 10 === 1 && n % 100 !== 11) return `${n} участник`;
                    if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return `${n} участника`;
                    return `${n} участников`;
                  })()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Media toggle */}
          <button
            onClick={() => { setShowMedia(!showMedia); if (!showMedia) fetchMedia(); }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
              showMedia
                ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                : "bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 text-zinc-500 dark:text-zinc-400"
            }`}
            title="Медиа"
          >
            <ImageIcon className="size-4" />
          </button>
          {/* Pinned count */}
          {pinnedMessages.length > 0 && (
            <button
              onClick={() => {
                const el = document.getElementById('pinned-banner');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-200 dark:hover:bg-amber-500/25 transition-all"
            >
              <Pin className="size-3" />
              {pinnedMessages.length}
            </button>
          )}
        </div>
      </div>

      {showMedia ? (
        /* Media Gallery */
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2 mb-4">
            <Grid3X3 className="size-4 text-zinc-500" />
            <h3 className="text-sm font-semibold">Медиа</h3>
            <button
              onClick={() => setShowMedia(false)}
              className="ml-auto w-7 h-7 rounded-lg bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {mediaLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-zinc-400" />
            </div>
          ) : mediaItems.length === 0 ? (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 py-16">Нет медиафайлов</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {mediaItems.map((item) => (
                <div key={item.id} className="aspect-square rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800">
                  {item.mediaType === "image" ? (
                    <img
                      src={item.mediaUrl}
                      alt=""
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                      <ImageIcon className="size-8 text-zinc-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Messages */
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scroll-smooth"
        >
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="size-6 animate-spin rounded-full border-2 border-zinc-500 border-t-indigo-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
              <div className="opacity-60">
                <Avatar id={conversation.id} name={chatName} size={16} />
              </div>
              <p className="text-sm">Начните общение</p>
              <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
                Сообщения защищены сквозным шифрованием
              </p>
            </div>
          ) : (
            <>
              {/* Pinned messages banner */}
              {pinnedMessages.length > 0 && (
                <div id="pinned-banner" className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 animate-slideIn">
                  <Pin className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-0.5">Закреплено</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
                      {pinnedMessages[0].content}
                    </p>
                    {pinnedMessages.length > 1 && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                        Ещё {pinnedMessages.length - 1} закреплённых сообщений
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Date separator for first message */}
              <div className="flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full glass">
                  {new Date(messages[0].createdAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })}
                </span>
                <div className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />
              </div>

              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderId === session?.user?.id}
                  onDelete={handleDelete}
                  onReply={setReplyTo}
                  onReact={handleReact}
                  onEdit={handleEdit}
                  onPin={handlePin}
                  stagger={i + 1}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && !showMedia && (
        <div className="px-5 py-1 text-[11px] text-zinc-400 dark:text-zinc-500 italic">
          {typingUsers.map((u) => u.username).join(", ")}{" "}
          {typingUsers.length === 1 ? "печатает" : "печатают"}…
        </div>
      )}

      {/* Input */}
      {!showMedia && (
        <MessageInput
          onSend={handleSend}
          onTyping={handleTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          otherOnline={otherOnline}
        />
      )}
    </div>
  );
}
