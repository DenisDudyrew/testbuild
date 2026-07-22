"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, Repeat2, Bell } from "lucide-react";
import Sidebar from "@/components/Sidebar";

interface Notification {
  id: string;
  type: 'like' | 'comment' | 'repost';
  read: boolean;
  createdAt: string;
  postId: string | null;
  commentId: string | null;
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

export default function NotificationsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (session) {
      loadNotifications();
    }
  }, [session]);

  const loadNotifications = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Отмечаем прочитанными при входе на страницу
  useEffect(() => {
    if (notifications.length > 0 && notifications.some(n => !n.read)) {
      markAllRead();
    }
  }, [notifications]);

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read', { method: 'PUT' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  const handleClick = (notification: Notification) => {
    if (notification.postId) {
      // Если есть комментарий — переходим на пост с раскрытыми комментариями
      if (notification.commentId) {
        router.push(`/feed?postId=${notification.postId}&commentId=${notification.commentId}`);
      } else {
        router.push(`/feed?postId=${notification.postId}`);
      }
    } else {
      router.push(`/profile/${notification.actor.id}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <Heart className="size-5 text-rose-500" />;
      case 'comment':
        return <MessageCircle className="size-5 text-indigo-500" />;
      case 'repost':
        return <Repeat2 className="size-5 text-green-500" />;
      default:
        return <Bell className="size-5 text-zinc-500" />;
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

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <div className="pl-60 max-md:pl-0">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6 animate-fadeIn">
        {/* Заголовок */}
        <div className="mb-6 flex items-center gap-4 pl-12 sm:pl-0">
          <h1 className="text-xl font-bold text-zinc-900 animate-slideIn">Уведомления</h1>
          {notifications.some(n => !n.read) && (
            <button
              onClick={markAllRead}
              className="ml-auto text-sm text-indigo-600 hover:text-indigo-700"
            >
              Прочитать все
            </button>
          )}
        </div>

        {/* Список уведомлений */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
          </div>
        ) : notifications.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 animate-fadeIn">
            <Bell className="mx-auto mb-3 size-10 text-zinc-300" />
            <p className="text-sm">Нет уведомлений</p>
          </div>
        ) : (
          <div className="space-y-1">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => handleClick(notification)}
                className={`flex w-full items-start gap-4 rounded-2xl px-4 py-4 text-left transition-colors hover:bg-zinc-100 cursor-pointer ${
                  !notification.read
                    ? 'bg-indigo-50/60 border-l-4 border-indigo-500'
                    : 'border-l-4 border-transparent'
                }`}
              >
                {/* Аватар актора */}
                <div className="relative shrink-0">
                  {notification.actor.avatar ? (
                    <img
                      src={notification.actor.avatar}
                      alt={notification.actor.username}
                      className="size-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="size-12 rounded-full bg-zinc-200" />
                  )}
                  {/* Иконка типа уведомления */}
                  <div className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-white bg-white">
                    {getIcon(notification.type)}
                  </div>
                </div>

                {/* Текст */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-700 leading-relaxed">
                    {getText(notification)}
                  </p>
                  {notification.post && (
                    <p className="mt-1 truncate text-sm text-zinc-400">
                      «{notification.post.content}»
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatTime(notification.createdAt)}
                  </p>
                </div>

                {/* Индикатор непрочитанного */}
                {!notification.read && (
                  <div className="mt-2 size-2.5 shrink-0 rounded-full bg-indigo-500" />
                )}
              </button>
            ))}
          </div>
        )}
        </main>
      </div>
    </div>
  );
}
