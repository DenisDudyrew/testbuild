"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Wind, Home, User, Shield, Search, LogOut, Bell, Newspaper, MessageCircle, Menu, X, Sun, Moon, Bookmark } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useTheme } from "./ThemeProvider";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 group"
    >
      <div className="relative size-5 shrink-0">
        <Sun className={`size-5 absolute inset-0 transition-all duration-300 ${
          theme === "light"
            ? "opacity-100 rotate-0 scale-100 text-amber-500"
            : "opacity-0 rotate-90 scale-75"
        }`} />
        <Moon className={`size-5 absolute inset-0 transition-all duration-300 ${
          theme === "dark"
            ? "opacity-100 rotate-0 scale-100 text-indigo-400"
            : "opacity-0 -rotate-90 scale-75"
        }`} />
      </div>
      <span className="inline">
        {theme === "light" ? "Тёмная тема" : "Светлая тема"}
      </span>

      {/* Toggle pill */}
      <div className={`ml-auto relative w-10 h-5 rounded-full transition-all duration-300 ${
        theme === "dark"
          ? "bg-indigo-500/30"
          : "bg-zinc-200"
      }`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
          theme === "dark"
            ? "translate-x-5 bg-indigo-400"
            : "translate-x-0.5"
        }`} />
      </div>
    </button>
  );
}

export default function Sidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messengerUnreadCount, setMessengerUnreadCount] = useState(0);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (session) {
      checkAdmin();
      loadUnreadCount();
      loadMessengerUnreadCount();
    }
  }, [session]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

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

  const loadMessengerUnreadCount = async () => {
    try {
      const res = await fetch('/api/messenger/unread');
      if (res.ok) {
        const data = await res.json();
        setMessengerUnreadCount(data.unreadCount);
      }
    } catch {}
  };

  // Периодический опрос непрочитанных сообщений
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(loadMessengerUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [session]);

  // Слушаем событие открытия чата — обновляем счётчик
  useEffect(() => {
    if (!session) return;
    const handler = () => loadMessengerUnreadCount();
    window.addEventListener('messenger:chatOpened', handler);
    return () => window.removeEventListener('messenger:chatOpened', handler);
  }, [session]);

  const isActive = (path: string) => pathname === path;

  const NavItem = ({ path, icon: Icon, label, activeColor = "text-indigo-700 bg-indigo-50", badge }: { path: string; icon: any; label: string; activeColor?: string; badge?: number }) => (
    <button
      onClick={() => router.push(path)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive(path)
          ? activeColor + " dark:!text-indigo-300 dark:!bg-indigo-500/20"
          : "text-zinc-700 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
      }`}
    >
      <div className="relative">
        <Icon className="size-5" />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className="inline">{label}</span>
    </button>
  );

  return (
    <>
      {/* Mobile toggle button — гамбургер, когда сайдбар закрыт */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className={`fixed top-4 left-4 z-50 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-800 p-2.5 shadow-lg border border-zinc-200 dark:border-zinc-700 sm:hidden transition-all duration-300 ${
          isMobileOpen ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        } hover:shadow-xl`}
      >
        <Menu className="size-5 text-zinc-700 dark:text-zinc-400" />
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 sm:hidden animate-fadeIn"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl
        transition-all duration-300 ease-out
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        sm:translate-x-0
      `}>
        {/* Кнопка закрытия — анимированно переезжает в правый верхний угол при открытии */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className={`absolute top-4 right-4 z-50 flex items-center justify-center rounded-xl bg-white dark:bg-zinc-800 p-2.5 shadow-lg border border-zinc-200 dark:border-zinc-700 sm:hidden transition-all duration-300 ${
            isMobileOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
          } hover:shadow-xl`}
        >
          <X className="size-5 text-zinc-700 dark:text-zinc-400" />
        </button>

        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2 px-5 py-4">
          <Wind className="size-7 text-indigo-600" />
          <span className="text-xl font-bold text-zinc-900 dark:text-white">ZEPHYR</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">v0.0.5</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3">
          <NavItem path="/feed" icon={Home} label="Лента" />
          <NavItem path="/search" icon={Search} label="Поиск" />
          <NavItem path="/notifications" icon={Bell} label="Уведомления" badge={unreadCount} />
          <div className="relative">
            <NavItem path="/messenger" icon={MessageCircle} label="Сообщения" badge={messengerUnreadCount} />
            {session && (
              <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" />
            )}
          </div>
          <NavItem path="/bookmarks" icon={Bookmark} label="Закладки" />
          <NavItem path={`/profile/${session?.user?.id}`} icon={User} label="Профиль" />
          <NavItem path="/updates" icon={Newspaper} label="Обновления" />
          {isAdmin && (
            <NavItem path="/admin" icon={Shield} label="Админ-панель" activeColor="text-amber-700 bg-amber-50 dark:!text-amber-400 dark:!bg-amber-500/20" />
          )}
        </nav>

        {/* Theme toggle */}
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-800">
          <ThemeToggle />
        </div>

        {/* Bottom section */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar
              id={session?.user?.id || ""}
              src={session?.user?.image}
              name={session?.user?.name || "Пользователь"}
              size={9}
              onClick={() => router.push(`/profile/${session?.user?.id}`)}
            />
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {session?.user?.name || "Пользователь"}
              </div>
            </div>
            <button
              onClick={async () => {
                await signOut({ redirect: false });
                router.push("/");
              }}
              className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition-all duration-200 hover:bg-red-50 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-400"
              title="Выйти"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
