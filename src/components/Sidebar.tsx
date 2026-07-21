"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Wind, Home, User, Shield, Search, LogOut, Bell, Newspaper } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

export default function Sidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (session) {
      checkAdmin();
      loadUnreadCount();
    }
  }, [session]);

  const checkAdmin = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(data.role === "admin");
      }
    } catch {}
  };

  const loadUnreadCount = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  };

  const isActive = (path: string) => pathname === path;

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-full w-60 flex-col border-r border-zinc-200 bg-white">
      {/* Логотип */}
      <div className="flex shrink-0 items-center gap-2 px-5 py-4">
        <Wind className="size-7 text-indigo-600" />
        <span className="text-xl font-bold text-zinc-900">ZEPHYR</span>
      </div>

      {/* Навигация */}
      <nav className="flex-1 space-y-1 px-3">
        <button
          onClick={() => router.push("/feed")}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive("/feed")
              ? "bg-indigo-50 text-indigo-700"
              : "text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <Home className="size-5" />
          Лента
        </button>

        <button
          onClick={() => router.push("/search")}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive("/search")
              ? "bg-indigo-50 text-indigo-700"
              : "text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <Search className="size-5" />
          Поиск
        </button>

        {/* Уведомления */}
        <div className="relative">
          <button
            onClick={() => router.push("/notifications")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive("/notifications")
                ? "bg-indigo-50 text-indigo-700"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <div className="relative">
              <Bell className="size-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            Уведомления
          </button>
        </div>

        <button
          onClick={() => router.push(`/profile/${session?.user?.id}`)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive(`/profile/${session?.user?.id}`)
              ? "bg-indigo-50 text-indigo-700"
              : "text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <User className="size-5" />
          Профиль
        </button>

        <button
          onClick={() => router.push("/updates")}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive("/updates")
              ? "bg-indigo-50 text-indigo-700"
              : "text-zinc-700 hover:bg-zinc-100"
          }`}
        >
          <Newspaper className="size-5" />
          Обновления
        </button>

        {isAdmin && (
          <button
            onClick={() => router.push("/admin")}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive("/admin")
                ? "bg-amber-50 text-amber-700"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <Shield className="size-5" />
            Админ-панель
          </button>
        )}
      </nav>

      {/* Нижняя часть: пользователь + выход */}
      <div className="border-t border-zinc-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="size-9 shrink-0 cursor-pointer overflow-hidden rounded-full bg-zinc-200"
            onClick={() => router.push(`/profile/${session?.user?.id}`)}
          >
            {session?.user?.image ? (
              <img src={session.user.image} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-400">
                <User className="size-5" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-sm font-medium text-zinc-900">
              {session?.user?.name || "Пользователь"}
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut({ redirect: false });
              router.push("/");
            }}
            className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            title="Выйти"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
