"use client";

import { useSession } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Wind, Camera, Upload, X } from "lucide-react";

export default function SetupPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [headerPreview, setHeaderPreview] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!session) {
      router.push('/');
    }
  }, [session, router]);

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

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      const updates: Record<string, string> = {};

      if (bio) updates.bio = bio;

      if (avatarFile) {
        const url = await uploadFile(avatarFile);
        if (url) updates.avatar = url;
      }

      if (headerFile) {
        const url = await uploadFile(headerFile);
        if (url) updates.header = url;
      }

      if (Object.keys(updates).length > 0) {
        const response = await fetch('/api/users/me', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Ошибка сохранения');
          setIsSaving(false);
          return;
        }

        await update();
      }

      router.push('/feed');
    } catch {
      setError('Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    router.push('/feed');
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Файл слишком большой. Максимум 10 MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Неподдерживаемый формат. Разрешены: JPEG, PNG, GIF, WebP');
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleHeaderFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Файл слишком большой. Максимум 10 MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Неподдерживаемый формат. Разрешены: JPEG, PNG, GIF, WebP');
      return;
    }
    setHeaderFile(file);
    setHeaderPreview(URL.createObjectURL(file));
  };

  if (!session) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Wind className="size-8 text-indigo-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">ZEPHYR</h1>
        </div>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Заполните информацию об аккаунте
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Аватар */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Аватар
            </label>
            <div className="flex items-center gap-4">
              <div className="size-20 shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden border-2 border-zinc-200 dark:border-zinc-700">
                {avatarPreview ? (
                  <Image src={avatarPreview} alt="Preview" width={80} height={80} className="h-full w-full object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-300 dark:text-zinc-500">
                    <Camera className="size-8" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
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
                    }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                  >
                    <X className="size-3" />
                    Убрать
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Шапка профиля */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Шапка профиля
            </label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-32 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden border-2 border-zinc-200 dark:border-zinc-700">
                {headerPreview ? (
                  <Image src={headerPreview} alt="Preview" width={128} height={64} className="h-full w-full object-cover" unoptimized />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-300 dark:text-zinc-500">
                    <Camera className="size-6" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
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
                    }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
                  >
                    <X className="size-3" />
                    Убрать
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* О себе */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              О себе
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Расскажите о себе..."
              className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              rows={3}
              maxLength={500}
            />
          </div>

          {/* Кнопки */}
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              Пропустить
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
