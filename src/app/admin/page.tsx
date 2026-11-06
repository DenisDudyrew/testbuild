"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import {
  Wind,
  Users,
  FileText,
  Trash2,
  Edit2,
  X,
  Check,
  Plus,
  Clock,
  MessageSquare,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useToast } from "@/components/ToastProvider";
import Sidebar from "@/components/Sidebar";
import RichTextEditor from "@/components/RichTextEditor";
import { themeSafeHtml } from "@/lib/release-note-html";

interface User {
  id: string;
  username: string;
  email: string | null;
  avatar: string | null;
  role: string;
  createdAt: string;
  _count: {
    posts: number;
    likes: number;
    comments: number;
  };
}

interface ReleaseNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface Post {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
  };
  _count: {
    likes: number;
    comments: number;
  };
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<
    "users" | "posts" | "messenger" | "release-notes"
  >("users");

  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const [releaseNotes, setReleaseNotes] = useState<ReleaseNote[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editRole, setEditRole] = useState("user");

  const { showConfirm, showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const [usersResponse, postsResponse, notesResponse] =
        await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/admin/posts"),
          fetch("/api/admin/release-notes"),
        ]);

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData);
      }

      if (postsResponse.ok) {
        const postsData = await postsResponse.json();
        setPosts(postsData);
      }

      if (notesResponse.ok) {
        const notesData = await notesResponse.json();
        setReleaseNotes(notesData);
      }
    } catch (error) {
      console.error("Error loading admin data:", error);
      showToast("Ошибка загрузки данных", "error");
    }
  }, [showToast]);

  const checkAdminAndLoad = useCallback(async () => {
    try {
      const userResponse = await fetch("/api/users/me");

      if (userResponse.ok) {
        const userData = await userResponse.json();

        if (userData.role !== "admin") {
          router.push("/");
          return;
        }

        setIsAdmin(true);
        await loadData();
      } else {
        router.push("/");
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      router.push("/");
    } finally {
      setLoading(false);
    }
  }, [loadData, router]);

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user?.id) {
      router.push("/");
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAdminAndLoad();
  }, [session, status, checkAdminAndLoad, router]);

  const handleDeleteUser = async (userId: string) => {
    const confirmed = await showConfirm(
      "Вы уверены, что хотите удалить этого пользователя? Все его посты и комментарии будут удалены."
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        showToast("Пользователь удалён", "success");
        await loadData();
      } else {
        const error = await response.json().catch(() => null);
        showToast(error?.error || "Не удалось удалить пользователя", "error");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
      showToast("Ошибка удаления пользователя", "error");
    }
  };

  const handleDeletePost = async (postId: string) => {
    const confirmed = await showConfirm(
      "Вы уверены, что хотите удалить этот пост?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/posts/${postId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        showToast("Пост удалён", "success");
        await loadData();
      } else {
        const error = await response.json().catch(() => null);
        showToast(error?.error || "Не удалось удалить пост", "error");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      showToast("Ошибка удаления поста", "error");
    }
  };

  const handleEditPost = async (post: Post) => {
    if (!editContent.trim()) {
      showToast("Введите текст поста", "error");
      return;
    }

    try {
      const response = await fetch(`/api/admin/posts/${post.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: editContent.trim(),
        }),
      });

      if (response.ok) {
        showToast("Пост обновлён", "success");
        await loadData();
        setEditingPostId(null);
        setEditContent("");
      } else {
        const error = await response.json().catch(() => null);
        showToast(error?.error || "Не удалось изменить пост", "error");
      }
    } catch (error) {
      console.error("Error editing post:", error);
      showToast("Ошибка сохранения поста", "error");
    }
  };

  const handleSaveUser = async (user: User) => {
    if (!editUsername.trim()) {
      showToast("Введите имя пользователя", "error");
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: editUsername.trim(),
          role: editRole,
        }),
      });

      if (response.ok) {
        showToast("Пользователь обновлён", "success");
        await loadData();
        setEditingUserId(null);
      } else {
        const error = await response.json().catch(() => null);
        showToast(error?.error || "Ошибка обновления пользователя", "error");
      }
    } catch (error) {
      console.error("Error updating user:", error);
      showToast("Ошибка сохранения пользователя", "error");
    }
  };

  const handleSaveReleaseNote = async () => {
    if (!editorTitle.trim() || !editorContent.trim()) {
      showToast("Заполните заголовок и содержание", "error");
      return;
    }

    try {
      if (editingNoteId) {
        const response = await fetch(
          `/api/admin/release-notes/${editingNoteId}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: editorTitle.trim(),
              content: editorContent,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          showToast(
            error?.error || "Не удалось сохранить обновление",
            "error"
          );
          return;
        }

        showToast("Обновление сохранено", "success");
      } else {
        const response = await fetch("/api/admin/release-notes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: editorTitle.trim(),
            content: editorContent,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => null);
          showToast(
            error?.error || "Не удалось создать обновление",
            "error"
          );
          return;
        }

        showToast("Обновление создано", "success");
      }

      setShowEditor(false);
      setEditingNoteId(null);
      setEditorTitle("");
      setEditorContent("");

      await loadData();
    } catch (error) {
      console.error("Error saving release note:", error);
      showToast("Ошибка сохранения обновления", "error");
    }
  };

  const handleDeleteReleaseNote = async (noteId: string) => {
    const confirmed = await showConfirm(
      "Вы уверены, что хотите удалить это обновление?"
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        `/api/admin/release-notes/${noteId}`,
        {
          method: "DELETE",
        }
      );

      if (response.ok) {
        showToast("Обновление удалено", "success");
        await loadData();
      } else {
        const error = await response.json().catch(() => null);
        showToast(error?.error || "Не удалось удалить обновление", "error");
      }
    } catch (error) {
      console.error("Error deleting release note:", error);
      showToast("Ошибка удаления обновления", "error");
    }
  };

  if (loading || (status === "loading" && !session)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600 dark:border-zinc-700" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400">
          Доступ запрещен
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />

      {/* 
        Главное изменение:
        main больше не имеет фиксированного maxWidth.
        На desktop он занимает всё пространство справа от Sidebar.
      */}
      <main
        className="
          min-h-screen
          min-w-0
          w-full
          px-4
          py-6
          sm:px-6
          md:ml-60
          md:w-[calc(100%-15rem)]
          lg:px-8
        "
      >
        {/* Верхняя панель / вкладки */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex min-w-max gap-2">
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "users"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Users className="size-4" />
              Пользователи ({users.length})
            </button>

            <button
              onClick={() => setActiveTab("posts")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "posts"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
              }`}
            >
              <FileText className="size-4" />
              Посты ({posts.length})
            </button>

            <button
              onClick={() => setActiveTab("messenger")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "messenger"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
              }`}
            >
              <MessageSquare className="size-4" />
              Мессенджер
            </button>

            <button
              onClick={() => setActiveTab("release-notes")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "release-notes"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Wind className="size-4" />
              Обновления ({releaseNotes.length})
            </button>
          </div>
        </div>

        <h1 className="mb-6 text-xl font-bold text-zinc-900 dark:text-white">
          Админ-панель
        </h1>

        {/* ========================================================= */}
        {/* ПОЛЬЗОВАТЕЛИ */}
        {/* ========================================================= */}

        {activeTab === "users" && (
          <div className="animate-fadeIn">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
              {/* 
                Горизонтальный скролл относится к внутреннему контейнеру,
                а не к самой карточке.
              */}
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[950px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Пользователь
                      </th>

                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Роль
                      </th>

                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Посты
                      </th>

                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Лайки
                      </th>

                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Комменты
                      </th>

                      <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Дата
                      </th>

                      {/* Закрепленная колонка */}
                      <th className="sticky right-0 z-20 whitespace-nowrap border-l border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-800/95 dark:text-zinc-400">
                        Действия
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {users.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                        >
                          Пользователей пока нет
                        </td>
                      </tr>
                    ) : (
                      users.map((user) => (
                        <tr
                          key={user.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar
                                id={user.id}
                                src={user.avatar}
                                name={user.username}
                                size={8}
                              />

                              <span className="whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white">
                                {user.username}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {editingUserId === user.id ? (
                              <select
                                value={editRole}
                                onChange={(e) =>
                                  setEditRole(e.target.value)
                                }
                                className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-800"
                              >
                                <option value="user">user</option>
                                <option value="admin">admin</option>
                              </select>
                            ) : (
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                  user.role === "admin"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                                    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                                }`}
                              >
                                {user.role}
                              </span>
                            )}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                            {user._count.posts}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                            {user._count.likes}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                            {user._count.comments}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                            {new Date(user.createdAt).toLocaleDateString(
                              "ru-RU"
                            )}
                          </td>

                          {/* Sticky Actions */}
                          <td className="sticky right-0 z-10 border-l border-zinc-200 bg-white px-4 py-3 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900">
                            {editingUserId === user.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editUsername}
                                  onChange={(e) =>
                                    setEditUsername(e.target.value)
                                  }
                                  className="w-32 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs outline-none focus:border-indigo-500 dark:border-zinc-800 dark:bg-zinc-800"
                                />

                                <button
                                  onClick={() => handleSaveUser(user)}
                                  className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
                                  title="Сохранить"
                                >
                                  <Check className="size-3.5" />
                                </button>

                                <button
                                  onClick={() => setEditingUserId(null)}
                                  className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                  title="Отмена"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingUserId(user.id);
                                    setEditUsername(user.username);
                                    setEditRole(user.role);
                                  }}
                                  className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                >
                                  <Edit2 className="size-3" />
                                  Редактировать
                                </button>

                                <button
                                  onClick={() =>
                                    handleDeleteUser(user.id)
                                  }
                                  className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                                >
                                  <Trash2 className="size-3" />
                                  Удалить
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ПОСТЫ */}
        {/* ========================================================= */}

        {activeTab === "posts" && (
          <div className="animate-fadeIn">
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[850px]">
                  <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                    <tr>
                      <th className="w-[140px] whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Автор
                      </th>

                      <th className="min-w-[350px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Контент
                      </th>

                      <th className="w-[80px] whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Лайки
                      </th>

                      <th className="w-[100px] whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Комменты
                      </th>

                      <th className="w-[110px] whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Дата
                      </th>

                      {/* Закрепленная колонка действий */}
                      <th className="sticky right-0 z-20 w-[240px] whitespace-nowrap border-l border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-800/95 dark:text-zinc-400">
                        Действия
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {posts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400"
                        >
                          Постов пока нет
                        </td>
                      </tr>
                    ) : (
                      posts.map((post) => (
                        <tr
                          key={post.id}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                        >
                          {/* Автор */}
                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                router.push(
                                  `/profile/${post.user.id}`
                                )
                              }
                              className="whitespace-nowrap text-sm font-medium text-zinc-900 hover:text-indigo-600 dark:text-white"
                            >
                              {post.user.username}
                            </button>
                          </td>

                          {/* Контент */}
                          <td className="px-4 py-3">
                            {editingPostId === post.id ? (
                              <div className="flex min-w-[320px] items-center gap-2">
                                <input
                                  type="text"
                                  value={editContent}
                                  onChange={(e) =>
                                    setEditContent(e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      handleEditPost(post);
                                    }

                                    if (e.key === "Escape") {
                                      setEditingPostId(null);
                                      setEditContent("");
                                    }
                                  }}
                                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-800"
                                  maxLength={1000}
                                  autoFocus
                                />

                                <button
                                  onClick={() =>
                                    handleEditPost(post)
                                  }
                                  className="shrink-0 rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
                                  title="Сохранить"
                                >
                                  <Check className="size-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setEditingPostId(null);
                                    setEditContent("");
                                  }}
                                  className="shrink-0 rounded-lg border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                                  title="Отмена"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div
                                className="max-w-[450px] truncate text-sm text-zinc-700 dark:text-zinc-300"
                                title={post.content}
                              >
                                {post.content || "—"}
                              </div>
                            )}
                          </td>

                          {/* Лайки */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                            {post._count.likes}
                          </td>

                          {/* Комментарии */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
                            {post._count.comments}
                          </td>

                          {/* Дата */}
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                            {new Date(
                              post.createdAt
                            ).toLocaleDateString("ru-RU")}
                          </td>

                          {/* Sticky Actions */}
                          <td className="sticky right-0 z-10 border-l border-zinc-200 bg-white px-4 py-3 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingPostId(post.id);
                                  setEditContent(post.content);
                                }}
                                className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                              >
                                <Edit2 className="size-3" />
                                Редактировать
                              </button>

                              <button
                                onClick={() =>
                                  handleDeletePost(post.id)
                                }
                                className="flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                              >
                                <Trash2 className="size-3" />
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Подсказка для узких экранов */}
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 md:hidden">
              Таблицу можно прокручивать горизонтально.
            </p>
          </div>
        )}

        {/* ========================================================= */}
        {/* МЕССЕНДЖЕР */}
        {/* ========================================================= */}

        {activeTab === "messenger" && (
          <div className="animate-fadeIn">
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
              <div className="p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                    <MessageSquare className="size-6 text-red-600 dark:text-red-400" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                      Очистить все данные мессенджера
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      Это удалит все диалоги, сообщения, закреплённые
                      сообщения, реакции и историю редактирований.
                      Пользователи потеряют всю историю переписки.
                      Действие необратимо.
                    </p>

                    <div className="mt-4">
                      <button
                        onClick={async () => {
                          const confirmed = await showConfirm(
                            "Вы уверены, что хотите полностью очистить мессенджер? Это удалит все диалоги и сообщения без возможности восстановления!"
                          );

                          if (!confirmed) return;

                          const doubleConfirmed = await showConfirm(
                            "Пожалуйста, подтвердите ещё раз. Все данные мессенджера будут безвозвратно удалены."
                          );

                          if (!doubleConfirmed) return;

                          try {
                            const response = await fetch(
                              "/api/admin/messenger/clear",
                              {
                                method: "POST",
                              }
                            );

                            if (response.ok) {
                              showToast(
                                "Мессенджер успешно очищен",
                                "success"
                              );
                            } else {
                              const error = await response
                                .json()
                                .catch(() => null);

                              showToast(
                                error?.error ||
                                  "Ошибка при очистке",
                                "error"
                              );
                            }
                          } catch (error) {
                            console.error(
                              "Error clearing messenger:",
                              error
                            );

                            showToast(
                              "Ошибка при очистке мессенджера",
                              "error"
                            );
                          }
                        }}
                        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                      >
                        <Trash2 className="size-4" />
                        Очистить мессенджер
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* RELEASE NOTES */}
        {/* ========================================================= */}

        {activeTab === "release-notes" && (
          <div className="animate-fadeIn">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Обновления (Release Notes)
              </h2>

              <button
                onClick={() => {
                  setEditingNoteId(null);
                  setEditorTitle("");
                  setEditorContent("");
                  setShowEditor(true);
                }}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Создать</span>
                <span className="sm:hidden">Добавить</span>
              </button>
            </div>

            {releaseNotes.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white py-16 text-center dark:border-zinc-800 dark:bg-zinc-900/50">
                <Wind className="mx-auto size-8 text-zinc-300 dark:text-zinc-600" />

                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                  Пока нет ни одного обновления
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {releaseNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50"
                  >
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                          {note.title}
                        </h3>

                        <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                          <Clock className="size-3 shrink-0" />

                          {new Date(
                            note.createdAt
                          ).toLocaleDateString("ru-RU", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() =>
                            handleDeleteReleaseNote(note.id)
                          }
                          className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                          title="Удалить"
                        >
                          <Trash2 className="size-4" />
                        </button>

                        <button
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditorTitle(note.title);
                            setEditorContent(note.content);
                            setShowEditor(true);
                          }}
                          className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                          title="Редактировать"
                        >
                          <Edit2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
                      <div
                        className="prose prose-sm prose-zinc line-clamp-3 max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{
                          __html: themeSafeHtml(note.content),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ===================================================== */}
            {/* МОДАЛЬНОЕ ОКНО RELEASE NOTE */}
            {/* ===================================================== */}

            {showEditor && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"
                onClick={() => setShowEditor(false)}
              >
                <div
                  className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                      {editingNoteId
                        ? "Редактировать обновление"
                        : "Создать обновление"}
                    </h3>

                    <button
                      onClick={() => setShowEditor(false)}
                      className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      <X className="size-5" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    placeholder="Заголовок обновления"
                    className="mb-3 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900"
                  />

                  <RichTextEditor
                    value={editorContent}
                    onChange={setEditorContent}
                    placeholder="Напишите текст обновления..."
                    minHeight="250px"
                  />

                  <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      onClick={() => setShowEditor(false)}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                    >
                      Отмена
                    </button>

                    <button
                      onClick={handleSaveReleaseNote}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      {editingNoteId ? "Сохранить" : "Создать"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}