"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import NextImage from "next/image";
import { ChevronLeft, Pin, Image as ImageIcon, X, Loader2, Grid3X3, ArrowDown, WifiOff } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import Avatar from "@/components/Avatar";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import { useSocket } from "@/lib/socket-client";


const PAGE_SIZE = 50;
const POLL_INTERVAL = 15000;
const TYPING_POLL_INTERVAL = 5000;



interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; username: string };
}

interface Message {
  id: string;
  conversationId?: string;
  tempId?: string;
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
  const messageContentRef = useRef<HTMLDivElement>(null);
  const jumpTarget = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<ReturnType<typeof useSocket>>(null!);
  const initialLoadRef = useRef(true);
  const isSendingRef = useRef(false);
  const isTypingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);
  const pendingRequest = useRef<{ key: string; id: string } | null>(null);
  const pageRequest = useRef<AbortController | null>(null);
  const latestRequest = useRef<AbortController | null>(null);
  const requestControllers = useRef(new Set<AbortController>());
  const scrollAnchor = useRef<{ height: number; top: number } | null>(null);
  const nearBottom = useRef(true);
  const syncRef = useRef<() => void>(() => {});
  const { showAlert } = useToast();
  const [loadError, setLoadError] = useState('');

  const socket = useSocket(session?.user?.id, {
    onMessageNew: (message) => {
      if (message.conversationId !== conversation.id) return;
      setMessages(prev => [...prev.filter(m => m.id !== message.id && (!message.tempId || m.id !== message.tempId)), message]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
    },
    onMessagesChanged: data => {
      if (data.conversationId !== conversation.id) return;
      syncRef.current();
      if (data.messageId) {
        fetch(`/api/messenger/messages/${data.messageId}`).then(async response => {
          if (!activeRef.current) return;
          if (response.status === 404) setMessages(prev => prev.filter(message => message.id !== data.messageId));
          else if (response.ok) {
            const updated: Message = await response.json();
            if (activeRef.current) setMessages(prev => prev.map(message => message.id === updated.id ? updated : message));
          }
        }).catch(() => {});
      }
    },
    onReconnect: () => syncRef.current(),
    onTypingUpdate: data => { if (data.conversationId === conversation.id) setTypingUsers(data.typing.filter(user => user.id !== session?.user?.id)); },
  });
  useEffect(() => { socketRef.current = socket; }, [socket]);

  useEffect(() => {
    if (socket.connected) return;
    const timer = setTimeout(() => setConnectionStatus('Обновляем сообщения автоматически. Подключение восстанавливается…'), 3000);
    return () => clearTimeout(timer);
  }, [socket.connected]);

  const fetchMessages = useCallback(async (cursor?: string | null) => {
    const history = !!cursor;
    if (history ? pageRequest.current : latestRequest.current) return;
    const controller = new AbortController();
    if (history) { pageRequest.current = controller; setLoadingMore(true); }
    else latestRequest.current = controller;
    requestControllers.current.add(controller);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/messenger/conversations/${conversation.id}/messages?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Не удалось загрузить сообщения. Попробуй ещё раз.');
      const data = await res.json();
      if (!activeRef.current || controller.signal.aborted) return;
      setLoadError('');
      const incoming: Message[] = data.messages || [];
      if (history) {
        const element = containerRef.current;
        if (element) scrollAnchor.current = { height: element.scrollHeight, top: element.scrollTop };
        setMessages(prev => Array.from(new Map([...incoming, ...prev].map(message => [message.id, message])).values()));
      } else {
        setMessages(prev => {
          const oldest = incoming[0];
          const history = oldest ? prev.filter(message => message.id.startsWith('temp-') || message.createdAt < oldest.createdAt || (message.createdAt === oldest.createdAt && message.id < oldest.id)) : prev.filter(message => message.id.startsWith('temp-'));
          return Array.from(new Map([...history, ...incoming].map(message => [message.id, message])).values());
        });
      }
      if (history || initialLoadRef.current) { setNextCursor(data.nextCursor); setHasMore(!!data.nextCursor); }
      setPinnedMessages(data.pinnedMessages || []);
    } catch (error) {
      if (!controller.signal.aborted && activeRef.current) setLoadError(error instanceof Error ? error.message : 'Нет соединения');
    } finally {
      requestControllers.current.delete(controller);
      if (pageRequest.current === controller) pageRequest.current = null;
      if (latestRequest.current === controller) latestRequest.current = null;
      if (activeRef.current && !controller.signal.aborted) { setLoading(false); setLoadingMore(false); }
    }
  }, [conversation.id]);

  useEffect(() => { syncRef.current = () => { void fetchMessages(); }; }, [fetchMessages]);
  useEffect(() => {
    activeRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMessages();
    socketRef.current.joinConversation(conversation.id);
    // Also reconciles edits/deletions after reconnects and events missed by a tab.
    const interval = setInterval(() => {
      if (!document.hidden && !isSendingRef.current) fetchMessages();
    }, POLL_INTERVAL);
    const typingInterval = setInterval(async () => {
      if (socketRef.current.connected) return;
      try {
        const res = await fetch(`/api/messenger/conversations/${conversation.id}/typing`);
        if (res.ok && activeRef.current) setTypingUsers((await res.json()).typing);
      } catch { /* next poll retries */ }
    }, TYPING_POLL_INTERVAL);
    const controllers = requestControllers.current;
    return () => {
      activeRef.current = false;
      clearInterval(interval); clearInterval(typingInterval);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      socketRef.current.leaveConversation(conversation.id);
      for (const controller of controllers) controller.abort();
      pageRequest.current = null; latestRequest.current = null;
    };
  }, [conversation.id, fetchMessages]);

  const scrollToBottom = useCallback(() => {
    const element = containerRef.current;
    if (element) element.scrollTop = element.scrollHeight;
    nearBottom.current = true;
    setShowScrollBtn(false);
  }, []);
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element || loading) return;
    if (jumpTarget.current) {
      document.getElementById(`message-${jumpTarget.current}`)?.scrollIntoView({ block: 'center' });
      jumpTarget.current = null;
      nearBottom.current = false;
    } else if (scrollAnchor.current) {
      element.scrollTop = scrollAnchor.current.top + element.scrollHeight - scrollAnchor.current.height;
      scrollAnchor.current = null;
    } else if (initialLoadRef.current || nearBottom.current) {
      scrollToBottom();
      initialLoadRef.current = false;
    }
  }, [messages, loading, showMedia, scrollToBottom]);

  useEffect(() => {
    const content = messageContentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [loading, showMedia, scrollToBottom]);

  useEffect(() => {
    const jump = async (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id !== 'string') return;
      const existing = document.getElementById(`message-${id}`);
      if (existing) { nearBottom.current = false; existing.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      try {
        const response = await fetch(`/api/messenger/messages/${id}`);
        if (!response.ok || !activeRef.current) return;
        const message: Message = await response.json();
        if (message.conversationId !== conversation.id) return;
        jumpTarget.current = id;
        setMessages(prev => Array.from(new Map([...prev, message].map(item => [item.id, item])).values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
      } catch { showAlert('Не удалось открыть сообщение'); }
    };
    window.addEventListener('messenger:jump', jump);
    return () => window.removeEventListener('messenger:jump', jump);
  }, [conversation.id, showAlert]);

  const handleTyping = useCallback(() => {
    if (isTypingRef.current) return;
    isTypingRef.current = true;
    typingTimer.current = setTimeout(() => { isTypingRef.current = false; }, 4000);
    if (socketRef.current.connected) socketRef.current.sendTyping(conversation.id, session?.user?.id || '', session?.user?.name || '');
    else fetch(`/api/messenger/conversations/${conversation.id}/typing`, { method: 'POST' }).catch(() => {});
  }, [conversation.id, session]);

  const mutate = useCallback(async (url: string, method: string, body?: object) => {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие');
    window.dispatchEvent(new Event('messenger:refresh'));
    return data;
  }, []);
  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    try { await mutate(`/api/messenger/messages/${messageId}/reactions`, 'POST', { emoji }); await fetchMessages(); }
    catch (error) { showAlert(error instanceof Error ? error.message : 'Не удалось добавить реакцию'); }
  }, [mutate, fetchMessages, showAlert]);
  const handleEdit = useCallback(async (messageId: string, content: string) => {
    try {
      const data = await mutate(`/api/messenger/messages/${messageId}`, 'PATCH', { content });
      if (activeRef.current) setMessages(prev => prev.map(message => message.id === messageId ? { ...message, content: data.content, editedAt: data.editedAt } : message));
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Не удалось изменить сообщение'); throw error; }
  }, [mutate, showAlert]);

  const handleSend = async (content: string, media?: { url: string; type: string; name: string }) => {
    if (isSendingRef.current) return false;
    isSendingRef.current = true;
    const key = JSON.stringify([content, media, replyTo?.id]);
    if (pendingRequest.current?.key !== key) pendingRequest.current = { key, id: `temp-${crypto.randomUUID()}` };
    const tempId = pendingRequest.current.id;
    const tempMessage: Message = {
      id: tempId, content, createdAt: new Date().toISOString(), senderId: session?.user?.id || '',
      sender: { id: session?.user?.id || '', username: session?.user?.name || '', avatar: null },
      mediaUrl: media?.url, mediaType: media?.type, mediaName: media?.name,
      replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, senderId: replyTo.senderId, sender: replyTo.sender } : null,
    };
    nearBottom.current = true;
    setMessages(prev => [...prev, tempMessage]);
    try {
      const data = await mutate(`/api/messenger/conversations/${conversation.id}/messages`, 'POST', {
        content, replyToId: replyTo?.id || null, mediaUrl: media?.url || null, mediaType: media?.type || null, mediaName: media?.name || null, tempId,
      });
      if (activeRef.current) {
        setMessages(prev => [...prev.filter(message => message.id !== tempId && message.id !== data.id), data]);
        setReplyTo(null);
      }
      pendingRequest.current = null;
      socketRef.current.stopTyping(conversation.id);
      return true;
    } catch (error) {
      if (activeRef.current) setMessages(prev => prev.filter(message => message.id !== tempId));
      showAlert(error instanceof Error ? error.message : 'Не удалось отправить сообщение. Текст сохранён.');
      return false;
    } finally { isSendingRef.current = false; }
  };
  const handleForward = useCallback((message: Message) => {
    setReplyTo(null);
    setDraftContent(`[Переслано от ${message.sender.username}]: ${message.content}`);
  }, []);
  const handlePin = useCallback(async (messageId: string) => {
    try { await mutate(`/api/messenger/conversations/${conversation.id}/pin`, 'POST', { messageId }); await fetchMessages(); }
    catch (error) { showAlert(error instanceof Error ? error.message : 'Не удалось закрепить сообщение'); }
  }, [conversation.id, mutate, fetchMessages, showAlert]);
  const handleDelete = useCallback(async (messageId: string, mode: 'forMe' | 'forEveryone' = 'forMe') => {
    try {
      await mutate(`/api/messenger/messages/${messageId}?mode=${mode}`, 'DELETE');
      if (activeRef.current) {
        setMessages(prev => prev.filter(message => message.id !== messageId));
        setPinnedMessages(prev => prev.filter(message => message.id !== messageId));
      }
    } catch (error) { showAlert(error instanceof Error ? error.message : 'Не удалось удалить сообщение'); }
  }, [mutate, showAlert]);
  const fetchMedia = async () => {
    setMediaLoading(true);
    try {
      const response = await fetch(`/api/messenger/conversations/${conversation.id}/media`);
      if (!response.ok) throw new Error('Не удалось загрузить медиа');
      const data = await response.json();
      if (activeRef.current) setMediaItems(data.media || []);
    } catch { showAlert('Не удалось загрузить медиа'); }
    finally { if (activeRef.current) setMediaLoading(false); }
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
    <div className="relative flex min-h-0 flex-col h-full">
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
                    <NextImage
                      src={item.mediaUrl}
                      alt=""
                      width={200}
                      height={200}
                      className="w-full h-full object-cover hover:scale-110 transition-transform duration-300"
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
        {!socket.connected && connectionStatus && (
          <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20">
            <WifiOff className="size-3 text-amber-500" />
            <span className="text-[11px] text-amber-700 dark:text-amber-400">{connectionStatus}</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4"
          onScroll={() => {
            const element = containerRef.current;
            if (!element) return;
            nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
            setShowScrollBtn(!nearBottom.current);
          }}
        >
          {loadError && <div role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">{loadError} <button onClick={() => fetchMessages()} className="underline">Повторить</button></div>}
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
                Доступ к чату есть только у его участников
              </p>
            </div>
          ) : (
            <div ref={messageContentRef} className="space-y-3">
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

              {hasMore && <button onClick={() => fetchMessages(nextCursor)} disabled={loadingMore} className="mx-auto my-3 block rounded-full border border-zinc-200 px-4 py-2 text-xs dark:border-zinc-700">{loadingMore ? 'Загрузка…' : 'Более ранние сообщения'}</button>}
              {listItems.map((item, index) => {
                if (item.type === 'date-separator') return <div key={`date-${index}`} className="py-3 text-center text-xs text-zinc-500">{item.date}</div>;
                if (item.type === 'unread-divider') return <div key="unread" className="my-3 text-center text-xs text-indigo-600 dark:text-indigo-300">Новые сообщения</div>;
                return <MessageBubble key={item.message.id} message={item.message} isOwn={item.message.senderId === session?.user?.id} onDelete={handleDelete} onReply={setReplyTo} onReact={handleReact} onEdit={handleEdit} onPin={handlePin} onForward={handleForward} />;
              })}
            </div>
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
