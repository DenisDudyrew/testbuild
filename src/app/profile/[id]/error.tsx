"use client";

export default function ProfileError({
  reset,
}: {
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-2">Пользователь не найден</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Профиль недоступен или был удалён.</p>
        <button
          onClick={reset}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-all"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
