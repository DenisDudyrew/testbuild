"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wind, Mail, KeyRound, CheckCircle, Loader2 } from "lucide-react";

export default function Home() {
  const { data: session, update } = useSession();
  const router = useRouter();

  // Режим: 'login' | 'register-email' | 'register-code' | 'register-details'
  const [mode, setMode] = useState<'login' | 'register-email' | 'register-code' | 'register-details'>('login');

  // Поля
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (session) {
      router.push('/feed');
    }
  }, [session, router]);

  // --- Логин ---
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    if (!username.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await signIn('credentials', {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Неверный логин или пароль');
        setIsSubmitting(false);
        return;
      }

      await update();
      router.push('/feed');
    } catch {
      setError('Ошибка соединения');
      setIsSubmitting(false);
    }
  };

  // --- Отправка кода на email ---
  const handleSendCode = async () => {
    setError('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Введите корректный email');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Не удалось отправить код');
        setIsSubmitting(false);
        return;
      }

      setMode('register-code');
      setIsSubmitting(false);
    } catch {
      setError('Ошибка соединения');
      setIsSubmitting(false);
    }
  };

  // --- Подтверждение кода ---
  const handleConfirmCode = async () => {
    setError('');
    if (!code.trim() || code.length !== 6) {
      setError('Введите 6-значный код из письма');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/confirm-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Неверный код');
        setIsSubmitting(false);
        return;
      }

      setMode('register-details');
      setIsSubmitting(false);
    } catch {
      setError('Ошибка соединения');
      setIsSubmitting(false);
    }
  };

  // --- Завершение регистрации ---
  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || username.trim().length < 3) {
      setError('Логин должен быть минимум 3 символа');
      return;
    }
    if (!password || password.length < 6) {
      setError('Пароль должен быть минимум 6 символов');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          setError('Пользователь с таким логином уже существует');
        } else {
          setError(data.error || 'Не удалось создать аккаунт');
        }
        setIsSubmitting(false);
        return;
      }

      // Вход в аккаунт
      const result = await signIn('credentials', {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Ошибка входа');
        setIsSubmitting(false);
        return;
      }

      await update();
      router.push('/setup');
    } catch {
      setError('Ошибка соединения');
      setIsSubmitting(false);
    }
  };

  const switchToLogin = () => {
    setMode('login');
    setError('');
    setEmail('');
    setCode('');
    setUsername('');
    setPassword('');
  };

  const switchToRegister = () => {
    setMode('register-email');
    setError('');
    setUsername('');
    setPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 p-8 shadow-sm dark:shadow-2xl dark:shadow-black/40">
        <div className="flex items-center gap-2 mb-6">
          <Wind className="size-8 text-indigo-600" />
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">ZEPHYR</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* --- Логин --- */}
        {mode === 'login' && (
          <>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">Войдите в аккаунт</p>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Логин</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-zinc-900 dark:bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Подождите...' : 'Войти'}
              </button>
              <button
                type="button"
                onClick={switchToRegister}
                className="w-full text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Нет аккаунта? Зарегистрироваться
              </button>
            </form>
          </>
        )}

        {/* --- Шаг 1: ввод email --- */}
        {mode === 'register-email' && (
          <>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">Начните регистрацию</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <Mail className="inline size-3 mr-1" />
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <button
                type="button"
                onClick={handleSendCode}
                disabled={isSubmitting}
                className="w-full rounded-lg bg-zinc-900 dark:bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Отправка...
                  </span>
                ) : (
                  'Отправить код')
                }
              </button>
              <button
                type="button"
                onClick={switchToLogin}
                className="w-full text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                Уже есть аккаунт? Войти
              </button>
            </div>
          </>
        )}

        {/* --- Шаг 2: ввод кода --- */}
        {mode === 'register-code' && (
          <>
            <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400">
              Код отправлен на <span className="font-medium text-zinc-800 dark:text-zinc-200">{email}</span>
            </p>
            <p className="mb-6 text-xs text-zinc-400 dark:text-zinc-500">Проверьте почту и введите 6-значный код</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <KeyRound className="inline size-3 mr-1" />
                  Код подтверждения
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-2.5 text-sm text-center text-lg tracking-[0.5em] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-zinc-100"
                />
              </div>
              <button
                type="button"
                onClick={handleConfirmCode}
                disabled={isSubmitting || code.length !== 6}
                className="w-full rounded-lg bg-zinc-900 dark:bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Проверка...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle className="size-4" />
                    Подтвердить
                  </span>
                )}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('register-email')}
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 py-2.5 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Сменить email
                </button>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={isSubmitting}
                  className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 py-2.5 text-xs text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Отправить снова
                </button>
              </div>
            </div>
          </>
        )}

        {/* --- Шаг 3: логин + пароль --- */}
        {mode === 'register-details' && (
          <>
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="size-4 shrink-0" />
              Email <span className="font-medium">{email}</span> подтверждён
            </div>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">Придумайте логин и пароль</p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Логин</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Минимум 3 символа"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Пароль</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-zinc-900 dark:bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Подождите...' : 'Создать аккаунт'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}