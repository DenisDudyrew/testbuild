// In-memory кеш просмотров: предотвращает накрутку при обновлении страницы
// Ключ: `${ip}-${postId}`, значение: timestamp последнего просмотра
const viewCache = new Map<string, number>();
const VIEW_COOLDOWN_MS = 5 * 60 * 1000; // 5 минут

// Простая ротация каждые 1000 записей, чтобы избежать утечки памяти
const MAX_CACHE_SIZE = 10000;

export function canIncrementView(ip: string, postId: string): boolean {
  const key = `${ip}-${postId}`;
  const now = Date.now();
  const lastView = viewCache.get(key);

  if (lastView && now - lastView < VIEW_COOLDOWN_MS) {
    return false;
  }

  // Очистка старых записей при переполнении
  if (viewCache.size >= MAX_CACHE_SIZE) {
    const entries = [...viewCache.entries()];
    const cutoff = now - VIEW_COOLDOWN_MS;
    for (const [k, t] of entries) {
      if (t < cutoff) viewCache.delete(k);
    }
    // Если всё ещё переполнен — удаляем каждую 2-ю запись
    if (viewCache.size >= MAX_CACHE_SIZE) {
      let i = 0;
      for (const k of viewCache.keys()) {
        if (i++ % 2 === 0) viewCache.delete(k);
      }
    }
  }

  viewCache.set(key, now);
  return true;
}

/**
 * Сбросить кеш просмотров (для тестов).
 */
export function resetViewCache(): void {
  viewCache.clear();
}
