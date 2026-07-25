"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { ChevronLeft, Pin, Image as ImageIcon, X, Loader2, Grid3X3, ArrowDown, WifiOff } from "lucide-react";
import { List, type RowComponentProps, type ListImperativeAPI } from "react-window";
import Avatar from "@/components/Avatar";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { useSocket } from "@/lib/socket-client";


const PAGE_SIZE = 50;
const POLL_INTERVAL = 15000;
const POST_DEBOUNCE_MS = 2000;
const TYPING_POLL_INTERVAL = 5000;
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
  lastReadAt?: string | null;
}

type ListItemType =
  | { type: 'message'; message: Message; index: number }
  | { type: 'date-separator'; date: string }
  | { type: 'unread-divider' };

interface Props {
  conversation: Conversation;
  onBack?: () => void;
}

export default function ChatView({ conversation, onBack }: Props) {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ id: string; username: string }[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaItems, setMediaItems] = useState<{ id: string; mediaUrl: string; mediaType: string }[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<string>('');

  // Вычисляем список элементов для отрисовки (сообщения + date separators + unread divider)
  const listItems: ListItemType[] = useMemo(() => {
    if (messages.length === 0) return [];
    const items: ListItemType[] = [];
    const unreadDate = conversation.lastReadAt ? new Date(conversation.lastReadAt) : null;
    let lastDate = '';
    let unreadInserted = false;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgDate = new Date(msg.createdAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      });

      if (msgDate !== lastDate) {
        if (items.length > 0 || i === 0) {
          items.push({ type: 'date-separator', date: msgDate });
        }
        lastDate = msgDate;
      }

      // Вставляем unread divider перед первым непрочитанным сообщением (только после разделителя даты)
      if (!unreadInserted && unreadDate && new Date(msg.createdAt) > unreadDate && msg.senderId !== session?.user?.id) {
        items.push({ type: 'unread-divider' });
        unreadInserted = true;
      }

      items.push({ type: 'message', message: msg, index: i });
    }
    return items;
  }, [messages, conversation.lastReadAt, session?.user?.id]);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<ListImperativeAPI | null>(null);
  const socketRef = useRef<ReturnType<typeof useSocket>>(null!);
  const lastPollRef = useRef(0);
  const isSendingRef = useRef(false);
  const isTypingRef = useRef(false);
  const prevScrollOffsetRef = useRef(0);
  const initialLoadRef = useRef(true);
  const [listHeight, setListHeight] = useState(0);

  const socket = useSocket(session?.user?.id, {
    onMessageNew: (message) => {
      setMessages((prev) => {
        if (prev.some(m => m.id === message.id)) return prev;
        // Ищем оптимистичное сообщение по tempId, который содержится в message.id
        // Сервер возвращает id вида "temp-{localIdCounter}" для optimistic-сообщений
        // Если сервер вернул сообщение с id, начинающимся на temp-, заменяем по нему
        const optimisticMatch = prev.find(m => m.id.startsWith('temp-') && m.senderId === message.senderId);
        if (optimisticMatch) {
          // Если id совпадает — просто заменяем, иначе ищем по content как fallback
          const exactMatch = prev.find(m => m.id === message.id);
          if (exactMatch) return prev.map(m => m.id === message.id ? message : m);
          // Fallback: заменяем первое temp-сообщение от того же отправителя
          return prev.map(m => m.id === optimisticMatch.id ? message : m);
        }
        return [...prev, message];
      });
    },
    onTypingUpdate: (data) => {
      if (data.conversationId === conversation.id) {
        setTypingUsers(data.typing);
      }
    },
  });

  // Отслеживаем статус подключения
  const prevConnectedRef = useRef(socket.connected);
  useEffect(() => {
    if (prevConnectedRef.current === socket.connected) return;
    prevConnectedRef.current = socket.connected;

    if (!socket.connected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnectionStatus("Подключение...");
      const timer = setTimeout(() => {
        if (!socket.connected) {
          setConnectionStatus("Переподключение...");
        }
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setConnectionStatus(null);
    }
  }, [socket.connected]);

  // Heartbeat for online status
  useEffect(() => {
    if (!socket.connected || !session?.user?.id) return;
    const uid = session.user.id;
    const interval = setInterval(() => {
      socketRef.current.sendHeartbeat(uid);
    }, 30000);
    return () => clearInterval(interval);
  }, [socket.connected, session?.user?.id]);

  const fetchMessages = useCallback(async (cursor?: string | null) => {
    const isInitial = !cursor;
    if (!isInitial) setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/messenger/conversations/${conversation.id}/messages?${params}`);
      if (!res.ok) {
        console.error(`Failed to fetch messages: ${res.status} ${res.statusText}`);
        return;
      }
      const data = await res.json();

      if (isInitial) {
        setMessages(data.messages || []);
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
        initialLoadRef.current = true;
      } else {
        const container = containerRef.current;
        if (container) {
          prevScrollOffsetRef.current = container.scrollTop;
        }
        setMessages((prev) => [...(data.messages || []), ...prev]);
        setNextCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      }

      if (data.pinnedMessages) {
        setPinnedMessages(data.pinnedMessages);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [conversation.id]);

  // Infinite scroll — загрузка старых сообщений при прокрутке вверх
  const handleRowsRendered = useCallback(({
    startIndex,
    stopIndex,
  }: {
    startIndex: number;
    stopIndex: number;
  }) => {
    const isNearBottom = stopIndex >= listItems.length - 3;
    setShowScrollBtn(!isNearBottom);

    if (startIndex === 0 && hasMore && !loadingMore && !loading) {
      fetchMessages(nextCursor);
    }
  }, [hasMore, loadingMore, loading, nextCursor, fetchMessages, listItems.length]);

  // Восстанавливаем позицию скролла после загрузки старых сообщений
  useEffect(() => {
    if (!loadingMore && prevScrollOffsetRef.current > 0) {
      const list = listRef.current;
      if (list) {
        list.scrollToRow({ index: messages.length - 50, align: "start" });
        prevScrollOffsetRef.current = 0;
      }
    }
  }, [loadingMore, messages]);

  // Scroll to bottom — скроллим к последнему элементу списка (последнему сообщению)
  const scrollToBottom = useCallback(() => {
    if (listItems.length > 0) {
      listRef.current?.scrollToRow({ index: listItems.length - 1, align: "end" });
    }
  }, [listItems.length]);

  useEffect(() => {
    if (initialLoadRef.current && !loading) {
      scrollToBottom();
      initialLoadRef.current = false;
    } else if (!loading && !loadingMore) {
      const list = listRef.current;
      if (list && list.element) {
        const { scrollTop, scrollHeight, clientHeight } = list.element;
        if (scrollHeight - scrollTop - clientHeight < 400) {
          scrollToBottom();
        }
      }
    }
  }, [listItems, loading, loadingMore, scrollToBottom]);

  // Синхронизируем socketRef в эффекте
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);



  const handleTyping = useCallback(() => {
    const s = socketRef.current;
    if (s.connected) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        s.sendTyping(conversation.id, session?.user?.id || '', session?.user?.name || '');
        setTimeout(() => { isTypingRef.current = false; }, 4000);
      }
    } else {
      fetch(`/api/messenger/conversations/${conversation.id}/typing`, {
        method: "POST",
      }).catch(() => {});
    }
  }, [conversation.id, session]);

  useEffect(() => {
    lastPollRef.current = Date.now();
  }, [conversation.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setLoading(true);
    setReplyTo(null);
    fetchMessages();

    socketRef.current.joinConversation(conversation.id);

    // Fallback polling (если Socket.IO не работает)
    const interval = setInterval(() => {
      if (socketRef.current.connected) return;
      if (isSendingRef.current) return;
      if (Date.now() - lastPollRef.current < POST_DEBOUNCE_MS) return;
      fetchMessages();
    }, POLL_INTERVAL);

    const typingInterval = setInterval(async () => {
      if (socketRef.current.connected) return;
      try {
        const res = await fetch(`/api/messenger/conversations/${conversation.id}/typing`);
        if (res.ok) {
          const data = await res.json();
          setTypingUsers(data.typing);
        }
      } catch {
        // silent
      }
    }, TYPING_POLL_INTERVAL);

    return () => {
      clearInterval(interval);
      clearInterval(typingInterval);
      socketRef.current.leaveConversation(conversation.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  // Measure container height for List
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    try {
      await fetch(`/api/messenger/messages/${messageId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error("Failed to toggle reaction:", err);
    }
  }, []);

  const handleEdit = useCallback(async (messageId: string, content: string) => {
    try {
      await fetch(`/api/messenger/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error("Failed to edit message:", err);
    }
  }, []);

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
        // Заменяем оптимистичное сообщение реальным из ответа сервера
        setMessages((prev) => prev.map(m => m.id === tempId ? data : m));
        // Отправляем через Socket.IO для real-time другим участникам
        socketRef.current.sendMessage(conversation.id, data);
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

  const handleForward = useCallback((message: Message) => {
    const text = `[Переслано от ${message.sender.username}]: ${message.content}`;
    setReplyTo(null);
    // Автоматически вставляем пересланное сообщение в поле ввода
    setDraftContent(text);
  }, []);

  const handlePin = useCallback(async (messageId: string) => {
    try {
      await fetch(`/api/messenger/conversations/${conversation.id}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
    } catch (err) {
      console.error("Failed to toggle pin:", err);
    }
  }, [conversation.id]);

  const handleDelete = useCallback(async (messageId: string, mode: 'forMe' | 'forEveryone' = 'forMe') => {
    try {
      await fetch(`/api/messenger/messages/${messageId}?mode=${mode}`, {
        method: "DELETE",
      });
      // Оптимистично убираем сообщение из локального списка
      if (mode === 'forMe') {
        setMessages((prev) => prev.filter(m => m.id !== messageId));
      } else {
        setMessages((prev) => prev.map(m => m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m));
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  }, []);

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

  // Функция для примерной высоты строки (Bug 5 — динамический расчёт)
  const estimateRowHeight = useCallback((index: number): number => {
    const item = listItems[index];
    if (!item) return 80;
    if (item.type === 'date-separator' || item.type === 'unread-divider') return 40;
    const msg = item.message;
    let height = 60; // base height
    if (msg.mediaUrl) height += 180; // media
    if (msg.replyTo) height += 40;
    if (msg.content.length > 100) height += 20; // long text
    if (Object.keys(msg.reactions || {}).length > 0) height += 30;
    return height;
  }, [listItems]);

  const Row = useCallback(({ index, style }: RowComponentProps) => {
    const item = listItems[index];
    if (!item) return null;

    if (item.type === 'date-separator') {
      return (
        <div style={style} className="flex items-center gap-4 py-2 px-2">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 px-3 py-1 rounded-full glass">
            {item.date}
          </span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-white/10" />
        </div>
      );
    }

    if (item.type === 'unread-divider') {
      return (
        <div style={style} className="flex items-center gap-4 py-2 px-2">
          <div className="flex-1 h-px bg-indigo-500/40" />
          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 px-3 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10">
            Новые сообщения
          </span>
          <div className="flex-1 h-px bg-indigo-500/40" />
        </div>
      );
    }

    const msg = item.message;
    return (
      <div style={style}>
        <MessageBubble
          message={msg}
          isOwn={msg.senderId === session?.user?.id}
          onDelete={handleDelete}
          onReply={setReplyTo}
          onReact={handleReact}
          onEdit={handleEdit}
          onPin={handlePin}
          onForward={handleForward}
          stagger={item.index + 1}
        />
      </div>
    );
  }, [listItems, session, handleDelete, handleReact, handleEdit, handlePin, handleForward]);

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
          {onBack && (
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <div className="relative size-11 shrink-0">
            <Avatar id={conversation.id} name={chatName} className="size-full" round />
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
        <>
        {/* Connection status banner */}
        {connectionStatus && (
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20">
            <WifiOff className="size-3 text-amber-500" />
            <span className="text-[11px] text-amber-700 dark:text-amber-400">{connectionStatus}</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto px-5 py-4 scroll-smooth"
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

              {listHeight > 0 && (
                <List
                  rowProps={{}}
                  style={{ height: listHeight, width: '100%' }}
                  rowCount={listItems.length}
                  rowHeight={estimateRowHeight}
                  listRef={listRef}
                  onRowsRendered={handleRowsRendered}
                  rowComponent={Row}
                />
              )}
            
            </>
          )}
        </div>
        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 right-6 w-10 h-10 rounded-full bg-white dark:bg-zinc-800 shadow-lg border border-zinc-200 dark:border-zinc-700 flex items-center justify-center hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all animate-slideIn z-10"
          >
            <ArrowDown className="size-5 text-zinc-600 dark:text-zinc-300" />
          </button>
        )}
        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="px-5 py-1 text-[11px] text-zinc-400 dark:text-zinc-500 italic">
            {typingUsers.map((u) => u.username).join(", ")}{" "}
            {typingUsers.length === 1 ? "печатает" : "печатают"}…
          </div>
        )}

        {/* Input */}
        <MessageInput
          onSend={handleSend}
          onTyping={handleTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          otherOnline={otherOnline}
          draftContent={draftContent}
        />
        </>
      )}
    </div>
  );
}
