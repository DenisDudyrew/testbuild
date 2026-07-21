"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Wind, Users, FileText, Trash2, Shield, Edit2, X, Check, Plus, Clock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ToastProvider";
import Sidebar from "@/components/Sidebar";
import RichTextEditor from "@/components/RichTextEditor";

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
  const [activeTab, setActiveTab] = useState<'users' | 'posts' | 'release-notes'>('users');
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
  const { showConfirm, showToast } = useToast();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user?.id) {
      router.push('/');
      return;
    }
    checkAdminAndLoad();
  }, [session, status]);

  const checkAdminAndLoad = async () => {

    try {
      // Проверяем роль пользователя
      const userResponse = await fetch('/api/users/me');
      if (userResponse.ok) {
        const userData = await userResponse.json();
        if (userData.role !== 'admin') {
          router.push('/');
          return;
        }
        setIsAdmin(true);
        await loadData();
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [usersResponse, postsResponse, notesResponse] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/admin/posts'),
        fetch('/api/admin/release-notes'),
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
      console.error('Error loading admin data:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const confirmed = await showConfirm('Вы уверены, что хотите удалить этого пользователя? Все его посты и комментарии будут удалены.');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const confirmed = await showConfirm('Вы уверены, что хотите удалить этот пост?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/posts/${postId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  if (loading || (status === 'loading' && !session)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="size-8 animate-spin rounded-full border-3 border-zinc-200 border-t-indigo-600" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="text-zinc-500">Доступ запрещен</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Sidebar />

      <main className="ml-60 mx-auto px-4 py-6" style={{ maxWidth: "calc(56rem + 60px)" }}>
        {/* Табы */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === 'users'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <Users className="size-4" />
            Пользователи ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === 'posts'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <FileText className="size-4" />
            Посты ({posts.length})
          </button>
          <button
            onClick={() => setActiveTab('release-notes')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === 'release-notes'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-zinc-700 hover:bg-zinc-100'
            }`}
          >
            <Wind className="size-4" />
            Обновления ({releaseNotes.length})
          </button>
        </div>

        {/* Таблица пользователей */}
        {activeTab === 'users' && (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Пользователь
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Роль
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Посты
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Лайки
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Комменты
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Дата
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-full bg-zinc-200 overflow-hidden">
                          {user.avatar ? (
                            <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{user.username}</div>
                          <div className="text-xs text-zinc-500">{user.email || 'Нет email'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        user.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{user._count.posts}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{user._count.likes}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{user._count.comments}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-3" />
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Таблица постов */}
        {activeTab === 'posts' && (
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Автор
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Контент
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Лайки
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Комменты
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Дата
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {posts.map((post) => (
                  <tr key={post.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div 
                        className="text-sm font-medium text-zinc-900 cursor-pointer hover:text-indigo-600"
                        onClick={() => router.push(`/profile/${post.user.id}`)}
                      >
                        {post.user.username}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editingPostId === post.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            maxLength={1000}
                          />
                          <button
                            onClick={async () => {
                              if (!editContent.trim()) return;
                              try {
                                const response = await fetch(`/api/admin/posts/${post.id}`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ content: editContent }),
                                });
                                if (response.ok) {
                                  await loadData();
                                  setEditingPostId(null);
                                  setEditContent("");
                                }
                              } catch (error) {
                                console.error('Error editing post:', error);
                              }
                            }}
                            className="rounded-lg bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
                          >
                            <Check className="size-3" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingPostId(null);
                              setEditContent("");
                            }}
                            className="rounded-lg border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-md truncate text-sm text-zinc-700">{post.content}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{post._count.likes}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{post._count.comments}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">
                      {new Date(post.createdAt).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingPostId(post.id);
                            setEditContent(post.content);
                          }}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                        >
                          <Edit2 className="size-3" />
                          Редактировать
                        </button>
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-3" />
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Release Notes */}
        {activeTab === 'release-notes' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Обновления (Release Notes)</h2>
              <button
                onClick={() => {
                  setEditingNoteId(null);
                  setEditorTitle("");
                  setEditorContent("");
                  setShowEditor(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="size-4" />
                Создать
              </button>
            </div>

            {releaseNotes.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-white py-16 text-center">
                <Wind className="mx-auto size-8 text-zinc-300" />
                <p className="mt-2 text-sm text-zinc-500">Пока нет ни одного обновления</p>
              </div>
            ) : (
              <div className="space-y-3">
                {releaseNotes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
                  >
                    <div className="flex items-start justify-between px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-semibold text-zinc-900">{note.title}</h3>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                          <Clock className="size-3" />
                          {new Date(note.createdAt).toLocaleDateString('ru-RU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <button
                          onClick={async () => {
                            const confirmed = await showConfirm('Вы уверены, что хотите удалить это обновление?');
                            if (!confirmed) return;
                            try {
                              const res = await fetch(`/api/admin/release-notes/${note.id}`, {
                                method: 'DELETE',
                              });
                              if (res.ok) {
                                await loadData();
                                showToast('Обновление удалено', 'success');
                              }
                            } catch (error) {
                              console.error('Error deleting release note:', error);
                            }
                          }}
                          className="rounded-lg px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-3" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditorTitle(note.title);
                            setEditorContent(note.content);
                            setShowEditor(true);
                          }}
                          className="rounded-lg px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"
                        >
                          <Edit2 className="size-3" />
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-zinc-100 px-5 py-3">
                      <div
                        className="prose prose-sm prose-zinc max-w-none line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: note.content }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Модалка редактора */}
            {showEditor && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                onClick={() => setShowEditor(false)}
              >
                <div
                  className="mx-4 w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="mb-4 text-lg font-semibold text-zinc-900">
                    {editingNoteId ? 'Редактировать обновление' : 'Создать обновление'}
                  </h3>

                  <input
                    type="text"
                    value={editorTitle}
                    onChange={(e) => setEditorTitle(e.target.value)}
                    placeholder="Заголовок обновления"
                    className="mb-3 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />

                  <RichTextEditor
                    value={editorContent}
                    onChange={setEditorContent}
                    placeholder="Напишите текст обновления..."
                    minHeight="250px"
                  />

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      onClick={() => setShowEditor(false)}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={async () => {
                        if (!editorTitle.trim() || !editorContent.trim()) {
                          showToast('Заполните заголовок и содержание', 'error');
                          return;
                        }
                        try {
                          if (editingNoteId) {
                            const res = await fetch(`/api/admin/release-notes/${editingNoteId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ title: editorTitle, content: editorContent }),
                            });
                            if (res.ok) {
                              showToast('Обновление сохранено', 'success');
                            }
                          } else {
                            const res = await fetch('/api/admin/release-notes', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ title: editorTitle, content: editorContent }),
                            });
                            if (res.ok) {
                              showToast('Обновление создано', 'success');
                            }
                          }
                          setShowEditor(false);
                          await loadData();
                        } catch (error) {
                          console.error('Error saving release note:', error);
                        }
                      }}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      {editingNoteId ? 'Сохранить' : 'Создать'}
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
