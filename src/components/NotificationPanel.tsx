"use client";

import { useState, useEffect, useRef } from "react";
import { Heart, MessageCircle, Repeat2, X, Bell } from "lucide-react";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'repost';
  read: boolean;
  createdAt: string;
  actor: {
    id: string;
    username: string;
    avatar: string | null;
  };
  post: {
    id: string;
    content: string;
  } | null;
}

export default function NotificationPanel({
  onClose,
  onUnreadCountChange,
}: {
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Небольшая задержка, чтобы не закрыть сразу при открытии
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        onUnreadCountChange(data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read', { method: 'PUT' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      onUnreadCountChange(0);
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  const handleClick = (notification: Notification) => {
    if (notification.post) {
      router.push(`/feed`);
    } else {
      router.push(`/profile/${notification.actor.id}`);
    }
    onClose();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="size-4 text-rose-500" />;
      case 'comment':
        return <MessageCircle className="size-4 text-indigo-500" />;
      case 'repost':
        return <Repeat2 className="size-4 text-green-500" />;
      default:
        return <Bell className="size-4 text-zinc-500" />;
    }
  };

  const getText = (notification: Notification) => {
    const actor = notification.actor.username;
    switch (notification.type) {
      case 'like':
        return <><span className="font-semibold">{actor}</span> поставил(а) лайк вашему посту</>;
      case 'comment':
        return <><span className="font-semibold">{actor}</span> оставил(а) комментарий к вашему посту</>;
      case 'repost':
        return <><span className="font-semibold">{actor}</span> сделал(а) репост вашего поста</>;
      default:
        return '';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin}м`;
    if (diffHour < 24) return `${diffHour}ч`;
    if (diffDay < 7) return `${diffDay}д`;
    return date.toLocaleDateString();
  };

  return (
    <div
      ref={panelRef}
      className="absolute left-full top-0 z-50 ml-2 w-80 rounded-2xl border border-zinc-200 bg-white shadow-xl"
    >
      {/* Заголовок */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-900">Уведомления</h3>
        <div className="flex items-center gap-2">
          {notifications.some(n => !n.read) && (
            <button
              onClick={markAllRead}
              className="text-xs text-indigo-600 hover:text-indigo-700"
            >
              Прочитать все
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Список уведомлений */}
      <div className="max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-5 animate-spin rounded-full border-2 border-zinc-200 border-t-indigo-600" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400">
            Нет уведомлений
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => handleClick(notification)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${
                !notification.read ? 'bg-indigo-50/40' : ''
              }`}
            >
              {/* Аватар актора */}
              <div className="relative shrink-0">
                {notification.actor.avatar ? (
                  <img
                    src={notification.actor.avatar}
                    alt={notification.actor.username}
                    className="size-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="size-9 rounded-full bg-zinc-200" />
                )}
                {/* Иконка типа уведомления */}
                <div className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-white bg-white">
                  {getIcon(notification.type)}
                </div>
              </div>

              {/* Текст */}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-zinc-700 leading-relaxed">
                  {getText(notification)}
                </p>
                {notification.post && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {notification.post.content}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-zinc-400">
                  {formatTime(notification.createdAt)}
                </p>
              </div>

              {/* Индикатор непрочитанного */}
              {!notification.read && (
                <div className="mt-1.5 size-2 shrink-0 rounded-full bg-indigo-500" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
