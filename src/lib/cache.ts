/**
 * In-memory кэш с TTL для ленты, сообщений и других данных.
 *
 * Features:
 * - TTL-based инвалидация
 * - Автоматическая ротация при превышении maxSize (LRU-like)
 * - Типизированные методы get/set
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

export class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  /**
   * @param ttlMs Время жизни записи в миллисекундах (по умолчанию 30 секунд)
   * @param maxSize Максимальное количество записей до ротации (по умолчанию 500)
   */
  constructor(ttlMs = 30_000, maxSize = 500) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /** Получить значение из кэша (возвращает undefined если срок истёк или ключ не найден) */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    // LRU: удаляем и вставляем заново, чтобы переместить в конец Map
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /** Сохранить значение в кэш */
  set(key: string, value: T): void {
    // Если превышен лимит — удаляем самую старую запись (первый ключ в Map)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.delete(key); // удаляем старый ключ для обновления порядка
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttlMs,
    });
  }

  /** Удалить запись из кэша */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /** Очистить весь кэш */
  clear(): void {
    this.cache.clear();
  }

  /** Инвалидировать все записи, начинающиеся с префикса (например, `feed:for-you:`) */
  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Текущий размер кэша */
  get size(): number {
    return this.cache.size;
  }

  /** Очистить истёкшие записи */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// Глобальные экземпляры кэша для разных типов данных
// Используем singleton через глобальный объект для сохранения между hot-reloads в dev режиме
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  // eslint-disable-next-line no-var
  var __caches: {
    feed: MemoryCache<any>;
    messages: MemoryCache<any>;
    trending: MemoryCache<any>;
    bookmarks: MemoryCache<any>;
  } | undefined;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function getGlobalCaches() {
  if (!globalThis.__caches) {
    globalThis.__caches = {
      // TTL 60 секунд для ленты (посты появляются не так часто)
      feed: new MemoryCache(60_000, 200),
      // TTL 30 секунд для сообщений (нужна более свежая информация)
      messages: new MemoryCache(30_000, 300),
      // TTL 5 минут для трендов (меняются редко)
      trending: new MemoryCache(300_000, 20),
      // TTL 30 секунд для закладок
      bookmarks: new MemoryCache(30_000, 100),
    };
  }
  return globalThis.__caches;
}

export const feedCache = () => getGlobalCaches().feed;
export const messagesCache = () => getGlobalCaches().messages;
export const trendingCache = () => getGlobalCaches().trending;
export const bookmarksCache = () => getGlobalCaches().bookmarks;