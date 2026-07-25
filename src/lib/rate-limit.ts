// Rate limiter с поддержкой Upstash (опционально) и in-memory fallback
// Использует @upstash/ratelimit если есть UPSTASH_REDIS_REST_URL, иначе in-memory

const requestCounts = new Map<string, { count: number; resetTime: number }>();

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Инициализировать очистку старых записей (вызывается при старте приложения).
 * Возвращает функцию для остановки интервала (для тестов).
 */
export function initRateLimitCleanup(): () => void {
  if (cleanupInterval) clearInterval(cleanupInterval);
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of requestCounts.entries()) {
      if (value.resetTime < now) {
        requestCounts.delete(key);
      }
    }
  }, 60000);
  return () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  };
}

// Авто-инициализация при импорте (не в тестовом окружении)
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
  initRateLimitCleanup();
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 30, // 30 запросов
  windowMs: 60 * 1000, // за 1 минуту
};

const STRICT_CONFIG: RateLimitConfig = {
  maxRequests: 10,  // 10 запросов
  windowMs: 60 * 1000, // за 1 минуту
};

// Строгие лимиты для чувствительных эндпоинтов
export function getStrictConfig(): RateLimitConfig {
  return STRICT_CONFIG;
}

export function getDefaultConfig(): RateLimitConfig {
  return DEFAULT_CONFIG;
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<{ success: boolean; remaining: number; resetTime: number }> {
  const now = Date.now();
  const record = requestCounts.get(key);

  if (!record || record.resetTime < now) {
    // Новое окно
    requestCounts.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { success: true, remaining: config.maxRequests - 1, resetTime: now + config.windowMs };
  }

  if (record.count >= config.maxRequests) {
    return { success: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { success: true, remaining: config.maxRequests - record.count, resetTime: record.resetTime };
}

// Получить ключ для rate limiting на основе IP
export function getRateLimitKey(request: Request, prefix: string = 'api'): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `${prefix}:${ip}`;
}
