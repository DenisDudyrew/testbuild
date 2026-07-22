"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2, Users, MessageCircle } from "lucide-react";
import Avatar from "@/components/Avatar";

interface User {
  id: string;
  username: string;
  avatar: string | null;
  bio: string | null;
}

interface Props {
  onClose: () => void;
  onSelect: (conversationId: string) => void;
}

export default function NewChatModal({ onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.length < 2) return;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/messenger/users?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) =>
      prev.some((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)
        : [...prev, user]
    );
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleCreate = async () => {
    const ids = isGroup
      ? selectedUsers.map((u) => u.id)
      : selectedUsers.length > 0
        ? [selectedUsers[0].id]
        : [];
    if (ids.length === 0) return;

    setCreating(true);
    try {
      const res = await fetch("/api/messenger/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: ids,
          ...(isGroup && groupName.trim() ? { name: groupName.trim() } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onSelect(data.id);
        onClose();
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const canCreate = isGroup
    ? selectedUsers.length >= 2 && groupName.trim().length > 0
    : selectedUsers.length === 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white/80 dark:bg-zinc-900/80 backdrop-blur-2xl rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-pop">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold">{isGroup ? "Новая группа" : "Новый чат"}</h3>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/10 hover:bg-zinc-200 dark:hover:bg-white/20 flex items-center justify-center transition-all"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Toggle single / group */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setIsGroup(false); setSelectedUsers([]); setGroupName(""); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all ${
              !isGroup
                ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20"
            }`}
          >
            <MessageCircle className="size-4" />
            Личный
          </button>
          <button
            onClick={() => { setIsGroup(true); setSelectedUsers([]); }}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all ${
              isGroup
                ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/25"
                : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-white/20"
            }`}
          >
            <Users className="size-4" />
            Группа
          </button>
        </div>

        {/* Group name input */}
        {isGroup && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border border-zinc-200 dark:border-white/10 mb-3">
            <input
              type="text"
              placeholder="Название группы..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
            />
          </div>
        )}

        {/* Selected users chips */}
        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-xs font-medium text-indigo-700 dark:text-indigo-300"
              >
                <Avatar id={user.id} name={user.username} size={5} />
                {user.username}
                <button
                  onClick={() => removeUser(user.id)}
                  className="ml-0.5 w-4 h-4 rounded-full bg-indigo-200 dark:bg-indigo-500/40 hover:bg-indigo-300 dark:hover:bg-indigo-500/60 flex items-center justify-center transition-all"
                >
                  <X className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl glass border border-zinc-200 dark:border-white/10 mb-4">
          <Search className="size-4 text-zinc-500 dark:text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Поиск пользователей..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500"
          />
          {loading && <Loader2 className="size-4 text-zinc-500 dark:text-zinc-400 animate-spin" />}
        </div>

        {/* Results */}
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {users.length === 0 && query.length >= 2 && !loading ? (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 py-8">
              Пользователи не найдены
            </p>
          ) : (
            users.map((user) => {
              const isSelected = selectedUsers.some((u) => u.id === user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => toggleUser(user)}
                  disabled={creating}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-2xl transition-all disabled:opacity-50 animate-flyInLeft ${
                    isSelected
                      ? "bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-500/30"
                      : "hover:bg-zinc-100 dark:hover:bg-white/10"
                  }`}
                >
                  <div className="relative">
                    <Avatar id={user.id} name={user.username} size={11} />
                    {isSelected && (
                      <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                        <svg className="size-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{user.username}</p>
                    {user.bio && (
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{user.bio}</p>
                    )}
                  </div>
                </button>
              );
            })
          )}

          {query.length < 2 && (
            <p className="text-center text-sm text-zinc-400 dark:text-zinc-500 py-8">
              Введите минимум 2 символа для поиска
            </p>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!canCreate || creating}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-medium transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-indigo-500/25"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              {isGroup ? <Users className="size-4" /> : <MessageCircle className="size-4" />}
              {isGroup
                ? `Создать группу (${selectedUsers.length})`
                : "Начать чат"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
