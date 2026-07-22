"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { Wind, Home, User, Shield, Search, LogOut, Bell, Newspaper, Menu, X } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

export default function Sidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (session) {
      checkAdmin();
      loadUnreadCount();
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

  const isActive = (path: string) => pathname === path;

  const NavItem = ({ path, icon: Icon, label, activeColor = "text-indigo-700 bg-indigo-50", badge }: { path: string; icon: any; label: string; activeColor?: string; badge?: number }) => (
    <button
      onClick={() => router.push(path)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive(path)
          ? activeColor
          : "text-zinc-700 hover:bg-zinc-100"
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
        className={`fixed top-4 left-4 z-50 flex items-center justify-center rounded-xl bg-white p-2.5 shadow-lg border border-zinc-200 sm:hidden transition-all duration-300 ${
          isMobileOpen ? "scale-0 opacity-0 pointer-events-none" : "scale-100 opacity-100"
        } hover:shadow-xl`}
      >
        <Menu className="size-5 text-zinc-700" />
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
        fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-zinc-200 bg-white
        transition-all duration-300 ease-out
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        sm:translate-x-0
      `}>
        {/* Кнопка закрытия — анимированно переезжает в правый верхний угол при открытии */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className={`absolute top-4 right-4 z-50 flex items-center justify-center rounded-xl bg-white p-2.5 shadow-lg border border-zinc-200 sm:hidden transition-all duration-300 ${
            isMobileOpen ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
          } hover:shadow-xl`}
        >
          <X className="size-5 text-zinc-700" />
        </button>

        {/* Logo */}
        <div className="flex shrink-0 items-center gap-2 px-5 py-4">
          <Wind className="size-7 text-indigo-600" />
          <span className="text-xl font-bold text-zinc-900">ZEPHYR</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3">
          <NavItem path="/feed" icon={Home} label="Лента" />
          <NavItem path="/search" icon={Search} label="Поиск" />
          <NavItem path="/notifications" icon={Bell} label="Уведомления" badge={unreadCount} />
          <NavItem path={`/profile/${session?.user?.id}`} icon={User} label="Профиль" />
          <NavItem path="/updates" icon={Newspaper} label="Обновления" />
          {isAdmin && (
            <NavItem path="/admin" icon={Shield} label="Админ-панель" activeColor="text-amber-700 bg-amber-50" />
          )}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-zinc-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="size-9 shrink-0 cursor-pointer overflow-hidden rounded-full bg-zinc-200 ring-2 ring-zinc-200 transition-all duration-200 hover:ring-indigo-400"
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
              className="flex shrink-0 items-center justify-center rounded-lg p-1.5 text-zinc-400 transition-all duration-200 hover:bg-red-50 hover:text-red-600"
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
