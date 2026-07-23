"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Plus, MessageCircle, X, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";

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
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
    mediaUrl: string | null;
    mediaType: string | null;
    mediaName: string | null;
    sender: { id: string; username: string };
  } | null;
  unreadCount: number;
  lastMessageAt: string;
  pinnedMessages?: { id: string; content: string }[];
  media?: { id: string; mediaUrl: string; mediaType: string }[];
}

interface Props {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}

export default function ConversationList({ activeConversationId, onSelect, onNewChat }: Props) {
  const { data: session } = useSession();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<{ id: string; content: string; createdAt: string; senderId: string; sender: { id: string; username: string } }[]>([]);
  const [messageSearching, setMessageSearching] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const messageSearchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // removed: isMobile state (unused)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messenger/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchConversations();
    // Poll every 30 seconds instead of 10
    const interval = setInterval(fetchConversations, 30000);
    return () => {
      clearInterval(interval);
      if (messageSearchTimerRef.current) {
        clearTimeout(messageSearchTimerRef.current);
      }
    };
  }, [fetchConversations]);


  const isOnline = useCallback((lastSeenAt?: string | null): boolean => {
    if (!lastSeenAt) return false;
    const diff = Date.now() - new Date(lastSeenAt).getTime();
    return diff < 120000;
  }, []);

  const getConversationName = (conv: Conversation): string => {
    if (conv.name) return conv.name;
    const otherParticipants = conv.participants.filter(p => p.id !== session?.user?.id);
    return otherParticipants.map(p => p.username).join(", ") || "Чат";
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) {
      return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    }
    if (days === 1) return "Вчера";
    if (days < 7) return date.toLocaleDateString("ru-RU", { weekday: "short" });
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  const filtered = conversations.filter(conv =>
    getConversationName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-white/10 bg-white/50 dark:bg-zinc-900/30 backdrop-blur-lg">
        <h2 className="text-lg font-bold">Сообщения</h2>
        <button
          onClick={onNewChat}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center hover:scale-110 transition-transform"
        >
          <Plus className="size-5" />
        </button>
      </div>

      {/* Search chats */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl glass border border-zinc-200 dark:border-white/10">
          <Search className="size-4 text-zinc-500 dark:text-zinc-400" />
          <input
            type="text"
            placeholder="Поиск чатов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
          />
        </div>
      </div>

      {/* Search messages */}
      {activeConversationId && (
        <div className="px-4 pb-2 relative">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl glass border border-zinc-200 dark:border-white/10">
            <Search className="size-4 text-zinc-500 dark:text-zinc-400" />
            <input
              type="text"
              placeholder="Поиск сообщений..."
              value={messageSearchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setMessageSearchQuery(val);
                if (val.length < 2) {
                  setMessageSearchResults([]);
                  setShowMessageSearch(false);
                  if (messageSearchTimerRef.current) {
                    clearTimeout(messageSearchTimerRef.current);
                  }
                  return;
                }
                if (messageSearchTimerRef.current) {
                  clearTimeout(messageSearchTimerRef.current);
                }
                setMessageSearching(true);
                setShowMessageSearch(true);
                messageSearchTimerRef.current = setTimeout(async () => {
                  try {
                    const res = await fetch(`/api/messenger/conversations/${activeConversationId}/search?q=${encodeURIComponent(val)}`);
                    if (res.ok) {
                      const data = await res.json();
                      setMessageSearchResults(data.messages || []);
                    }
                  } catch {
                    // ignore
                  } finally {
                    setMessageSearching(false);
                  }
                }, 300);
              }}
              className="flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
            />
            {messageSearchQuery && (
              <button
                onClick={() => { setMessageSearchQuery(""); setMessageSearchResults([]); setShowMessageSearch(false); }}
                className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-white/10 flex items-center justify-center hover:bg-zinc-300 dark:hover:bg-white/20 transition-all"
              >
                <X className="size-3" />
              </button>
            )}
            {messageSearching && <Loader2 className="size-4 text-zinc-500 dark:text-zinc-400 animate-spin" />}
          </div>

          {/* Message search results dropdown */}
          {showMessageSearch && messageSearchQuery.length >= 2 && (
            <div className="absolute left-4 right-4 top-full mt-1 z-20 bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700 max-h-48 overflow-y-auto">
              {messageSearchResults.length === 0 && !messageSearching ? (
                <p className="text-center text-xs text-zinc-400 py-4">Ничего не найдено</p>
              ) : (
                messageSearchResults.map((msg) => (
                  <button
                    key={msg.id}
                    onClick={() => {
                      onSelect(activeConversationId);
                      setShowMessageSearch(false);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-zinc-100 dark:hover:bg-white/10 transition-all border-b border-zinc-100 dark:border-white/5 last:border-0"
                  >
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{msg.sender.username}</p>
                    <p className="text-sm truncate">{msg.content}</p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5 scroll-smooth">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="size-6 animate-spin rounded-full border-2 border-zinc-500 border-t-indigo-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-400 dark:text-zinc-500">
            <MessageCircle className="size-10 mb-3 opacity-50" />
            <p className="text-sm">
              {searchQuery ? "Ничего не найдено" : "Нет чатов"}
            </p>
            {!searchQuery && (
              <button
                onClick={onNewChat}
                className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300"
              >
                Написать кому-нибудь
              </button>
            )}
          </div>
        ) : (
          filtered.map((conv, i) => {
            const name = getConversationName(conv);
            const isActive = conv.id === activeConversationId;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full text-left rounded-2xl p-3.5 transition-all duration-200 animate-flyInUp animate-stagger-${Math.min(i + 1, 8)} ${
                  isActive
                    ? "glass-indigo border border-indigo-500/30"
                    : "hover:bg-zinc-100 dark:hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    <Avatar id={conv.id} name={name} size={12} round />
                    {conv.type !== "group" && (() => {
                      const other = conv.participants.find(p => p.id !== session?.user?.id);
                      return other && isOnline(other.lastSeenAt) ? (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
                      ) : null;
                    })()}
                    {conv.unreadCount > 0 && (
                      <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold ring-2 ring-white dark:ring-zinc-900">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {getConversationName(conv)}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0">
                          {formatTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${
                      conv.unreadCount > 0 ? "text-zinc-700 dark:text-zinc-200 font-medium" : "text-zinc-400 dark:text-zinc-500"
                    }`}>
                      {conv.lastMessage
                        ? (() => {
                            const lm = conv.lastMessage;
                            const prefix = lm.senderId === session?.user?.id ? "Вы: " : "";
                            if (lm.mediaType === "image" || lm.mediaType === "video") {
                              return `${prefix}${lm.mediaType === "image" ? "📷" : "🎬"} ${lm.mediaName ? lm.mediaName.substring(0, 10) + (lm.mediaName.length > 10 ? "…" : "") : "Медиа"}`;
                            }
                            if (lm.mediaType === "file") {
                              return `${prefix}📎 ${lm.mediaName ? lm.mediaName.substring(0, 10) + (lm.mediaName.length > 10 ? "…" : "") : "Файл"}`;
                            }
                            return `${prefix}${lm.content.substring(0, 60)}`;
                          })()
                        : "Нет сообщений"}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
