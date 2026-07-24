"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { use } from "react";
import { Wind, Calendar, Edit, Trash2, Camera, Upload, Repeat2, Heart, MessageCircle, MessageSquareMore } from "lucide-react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/Avatar";
import { useToast } from "@/components/ToastProvider";
import Sidebar from "@/components/Sidebar";
import PostForm from "@/components/PostForm";

interface User {
  id: string;
  username: string;
  avatar: string | null;
  header: string | null;
  bio: string | null;
  createdAt: string;
  posts: Array<{
    id: string;
    content: string;
    mediaUrl: string | null;
    mediaType: string | null;
    views: number;
    createdAt: string;
    likes: Array<{ userId: string }>;
    comments: Array<{ id: string }>;
    repostOf?: {
      id: string;
      content: string;
      mediaUrl: string | null;
      mediaType: string | null;
      createdAt: string;
      user: {
        id: string;
        username: string;
        avatar: string | null;
      };
      likes: Array<{ userId: string }>;
      _count?: {
        likes: number;
        comments: number;
        reposts: number;
      };
    } | null;
    repostedComment?: {
      id: string;
      content: string;
      createdAt: string;
      postId: string;
      user: { id: string; username: string; avatar: string | null };
      likes: Array<{ userId: string }>;
      _count?: { likes: number };
      post?: {
        id: string;
        content: string;
        mediaUrl: string | null;
        mediaType: string | null;
        createdAt: string;
        user: { id: string; username: string; avatar: string | null };
      } | null;
    } | null;
  }>;
  _count: {
    posts: number;
    likes: number;
    comments: number;
  };
}

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: "",
    avatar: "",
    header: "",
    bio: "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const { showAlert, showToast } = useToast();

  const loadUser = useCallback(async () => {
    try {
      const response = await fetch(`/api/users/${resolvedParams.id}`);
      if (response.ok) {
        const data = await response.json();
        setUser(data);
        setEditForm({
          username: data.username,
          avatar: data.avatar || "",
          header: data.header || "",
          bio: data.bio || "",
        });
        setAvatarPreview(null);
        setHeaderPreview(null);
        setAvatarFile(null);
        setHeaderFile(null);
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  // removed: loadFollowStatus (unused)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUser();
  }, [resolvedParams.id, loadUser]);

  // removed: handleFollow (unused)

  const uploadFile = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.mediaUrl;
    } catch {
      return null;
    }
  };

  const handleSaveProfile = async () => {
    setIsUploading(true);
    try {
      const updates: Record<string, string> = {};

      if (editForm.username) updates.username = editForm.username;
      if (editForm.bio !== undefined) updates.bio = editForm.bio;

      // Загружаем аватарку, если выбрана
      if (avatarFile) {
        const url = await uploadFile(avatarFile);
        if (url) updates.avatar = url;
      }

      // Загружаем шапку, если выбрана
      if (headerFile) {
        const url = await uploadFile(headerFile);
        if (url) updates.header = url;
      }

      const response = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) {
        await loadUser();
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Файл слишком большой. Максимум 10 MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAlert('Неподдерживаемый формат. Разрешены: JPEG, PNG, GIF, WebP');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleHeaderFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Файл слишком большой. Максимум 10 MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showAlert('Неподдерживаемый формат. Разрешены: JPEG, PNG, GIF, WebP');
      return;
    }
    setHeaderFile(file);
    setHeaderPreview(URL.createObjectURL(file));
  };

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch('/api/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (response.ok) {
        router.push('/');
        showToast('Аккаунт удалён', 'success');
      } else {
        showAlert('Неверный пароль');
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-500 dark:text-zinc-400 animate-pulse">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 animate-fadeIn">
        <div className="text-zinc-500 dark:text-zinc-400">Пользователь ��е найден</div>
      </div>
    );
  }

  const isOwnProfile = session?.user?.id === user.id;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Sidebar />

      <div className="pl-60 max-md:pl-0">
        <main className="mx-auto max-w-2xl min-[1600px]:max-w-3xl px-4 py-6 animate-fadeIn">
        {/* Шапка профиля */}
        <div className="mb-6 animate-flyInUp">
          <div className="relative h-36 md:h-48 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600">
            {user.header && (
              <img src={user.header} alt="Header" className="h-full w-full object-cover" />
            )}
          </div>
          
          <div className="relative -mt-16 px-4 text-center md:text-left">
              <div className="flex flex-col md:flex-row items-center md:items-end gap-4">
              <div className="size-24 md:size-32 rounded-full border-4 border-white dark:border-zinc-800 bg-zinc-200 dark:bg-zinc-800 overflow-hidden shadow-lg ring-2 ring-indigo-300">
                {user.avatar ? (
                  <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-500">
                    <Wind className="size-16" />
                  </div>
                )}
              </div>
              
              <div className="mb-2 flex-1 text-center md:text-left">
                <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-white">{user.username}</h1>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Calendar className="size-4" />
                  {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                </div>
              </div>

              {isOwnProfile && (
                <div className="mb-2 flex gap-2 justify-center md:justify-start">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <Edit className="size-4" />
                    {isEditing ? 'Отмена' : 'Редактировать'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
                  >
                    <Trash2 className="size-4" />
                    Удалить
                  </button>
                </div>
              )}
            </div>

            {user.bio && (
              <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">{user.bio}</p>
            )}

            {/* Статистика */}
            <div className="mt-4 flex justify-center md:justify-start gap-6">
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-900 dark:text-white">{user._count.posts}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Постов</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-900 dark:text-white">{user._count.likes}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Лайков</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold text-zinc-900 dark:text-white">{user._count.comments}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Комментариев</div>
              </div>
            </div>
          </div>
        </div>

        {/* Форма редактирования */}
        {isEditing && isOwnProfile && (
          <div className="mb-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-4 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-white">Редактировать профиль</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Имя пользователя</label>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Аватар</label>
                <div className="flex items-center flex-wrap gap-3">
                  <div className="size-14 md:size-16 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden border-2 border-zinc-200 dark:border-zinc-700 aspect-square">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : user.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300 dark:text-zinc-500">
                        <Camera className="size-6" />
                      </div>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleAvatarFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <Upload className="size-3.5" />
                    {avatarFile ? 'Изменить' : 'Загрузить'}
                  </button>
                  {avatarFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarFile(null);
                        setAvatarPreview(null);
                        if (avatarInputRef.current) avatarInputRef.current.value = '';
                      }}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Убрать
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Шапка профиля</label>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-24 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden border-2 border-zinc-200 dark:border-zinc-700">
                    {headerPreview ? (
                      <img src={headerPreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : user.header ? (
                      <img src={user.header} alt="Header" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300 dark:text-zinc-500">
                        <Camera className="size-5" />
                      </div>
                    )}
                  </div>
                  <input
                    ref={headerInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={handleHeaderFileSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => headerInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <Upload className="size-3.5" />
                    {headerFile ? 'Изменить' : 'Загрузить'}
                  </button>
                  {headerFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setHeaderFile(null);
                        setHeaderPreview(null);
                        if (headerInputRef.current) headerInputRef.current.value = '';
                      }}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      Убрать
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">О себе</label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  rows={3}
                />
              </div>
              <button
                onClick={handleSaveProfile}
                disabled={isUploading}
                className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {isUploading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        )}

        {/* Модальное окно удаления */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-6 shadow-lg animate-pop">
              <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-white">Удалить аккаунт?</h3>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Это действие необратимо. Все ваши посты, лайки и комментарии будут удалены.
              </p>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Подтвердите пароль
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-4 py-2 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword("");
                  }}
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  Отмена
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={!deletePassword}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Форма создания поста (только свой профиль) */}
        {isOwnProfile && (
          <PostForm onPostCreated={loadUser} />
        )}

        {/* Посты пользователя */}
        <div className="space-y-4 animate-fadeIn">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white animate-flyInLeft pl-12 sm:pl-0">Посты</h2>
          {user.posts.length === 0 ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-8 text-center text-zinc-500 dark:text-zinc-400 animate-pop">
              Пока нет постов
            </div>
          ) : (
            user.posts.map((post, idx) => (
              <article key={post.id} className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/50 backdrop-blur-lg p-4 shadow-sm animate-slideUp animate-stagger-${Math.min(idx + 1, 8)} hover:border-indigo-500/20 transition-all duration-300`}>
                <div className="flex items-start gap-3">
                  <div className="size-10 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                    {user.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                        {user.username}
                      </span>
                      <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {new Date(post.createdAt).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">• {post.views} просмотров</span>
                    </div>
                    <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{post.content}</p>
                    
                    {post.mediaUrl && (
                      <div className="mt-3 overflow-hidden rounded-xl bg-black/5 dark:bg-white/5">
                        {post.mediaType === 'image' ? (
                          <img src={post.mediaUrl} alt="Post media" className="w-full max-h-[80vh] object-contain" />
                        ) : post.mediaType === 'video' || post.mediaType === 'circle' ? (
                          <video src={post.mediaUrl} controls className="w-full max-h-[80vh] object-contain" />
                        ) : null}
                      </div>
                    )}

                    {post.repostOf && (
                      <div className="mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
                        <div className="flex items-center gap-2">
                          <Repeat2 className="size-3 text-zinc-400" />
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">Репост</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Avatar id={post.repostOf.user.id} src={post.repostOf.user.avatar} name={post.repostOf.user.username} size={5} />
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            {post.repostOf.user.username}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{post.repostOf.content}</p>
                        {post.repostOf.mediaUrl && (
                          <div className="mt-2 overflow-hidden rounded-lg">
                            {post.repostOf.mediaType === 'image' ? (
                              <img src={post.repostOf.mediaUrl} alt="Media" className="w-full max-h-48 object-contain" />
                            ) : (
                              <video src={post.repostOf.mediaUrl} controls className="w-full max-h-48 object-contain" />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {post.repostedComment && (
                      <div className="mt-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 p-3">
                        <div className="flex items-center gap-2">
                          <MessageSquareMore className="size-3 text-indigo-400" />
                          <span className="text-xs text-indigo-500 dark:text-indigo-400">Репост комментария</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Avatar id={post.repostedComment.user.id} src={post.repostedComment.user.avatar} name={post.repostedComment.user.username} size={5} />
                          <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                            {post.repostedComment.user.username}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{post.repostedComment.content}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                          <Heart className="size-3" /> {post.repostedComment._count?.likes || 0}
                        </div>
                        {post.repostedComment.post && (
                          <div className="mt-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-2">
                            <div className="flex items-center gap-2">
                              <Avatar id={post.repostedComment.post.user.id} src={post.repostedComment.post.user.avatar} name={post.repostedComment.post.user.username} size={4} />
                              <span className="text-xs font-semibold text-zinc-900 dark:text-white">{post.repostedComment.post.user.username}</span>
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                {new Date(post.repostedComment.post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{post.repostedComment.post.content}</p>
                            {post.repostedComment.post.mediaUrl && (
                              <div className="mt-1 overflow-hidden rounded-lg">
                                {post.repostedComment.post.mediaType === 'image' ? (
                                  <img src={post.repostedComment.post.mediaUrl} alt="Media" className="w-full max-h-32 object-contain" />
                                ) : (
                                  <video src={post.repostedComment.post.mediaUrl} controls className="w-full max-h-32 object-contain" />
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                      <div className="mt-4 flex items-center gap-6">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                        <Heart className="size-4" />
                        {post.likes.length}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                        <MessageCircle className="size-4" />
                        {post.comments?.length || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
