import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  getDefaultConfig,
  getStrictConfig,
  getRateLimitKey,
} from '../rate-limit';

describe('rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests within limit', async () => {
    const config = { maxRequests: 5, windowMs: 60000 };
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit('test-key', config);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(config.maxRequests - i - 1);
    }
  });

  it('blocks requests exceeding limit', async () => {
    const config = { maxRequests: 3, windowMs: 60000 };
    for (let i = 0; i < 3; i++) {
      await checkRateLimit('test-key', config);
    }
    const result = await checkRateLimit('test-key', config);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets window after timeout', async () => {
    const config = { maxRequests: 2, windowMs: 60000 };
    await checkRateLimit('test-key', config);
    await checkRateLimit('test-key', config);

    // Should be blocked now
    let result = await checkRateLimit('test-key', config);
    expect(result.success).toBe(false);

    // Advance time past window
    vi.advanceTimersByTime(60001);

    // Should be allowed again
    result = await checkRateLimit('test-key', config);
    expect(result.success).toBe(true);
  });

  it('different keys have independent limits', async () => {
    const config = { maxRequests: 2, windowMs: 60000 };
    await checkRateLimit('key-a', config);
    await checkRateLimit('key-a', config);

    // Key-a should be blocked
    expect((await checkRateLimit('key-a', config)).success).toBe(false);

    // Key-b should still be allowed
    expect((await checkRateLimit('key-b', config)).success).toBe(true);
  });

  it('returns proper resetTime', async () => {
    const now = Date.now();
    const config = { maxRequests: 5, windowMs: 60000 };
    const result = await checkRateLimit('test-key', config);
    expect(result.resetTime).toBeGreaterThanOrEqual(now + config.windowMs - 100);
  });
});

describe('config helpers', () => {
  it('getDefaultConfig returns 30 requests per minute', () => {
    const config = getDefaultConfig();
    expect(config.maxRequests).toBe(30);
    expect(config.windowMs).toBe(60000);
  });

  it('getStrictConfig returns 10 requests per minute', () => {
    const config = getStrictConfig();
    expect(config.maxRequests).toBe(10);
    expect(config.windowMs).toBe(60000);
  });
});

describe('getRateLimitKey', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
    });
    const key = getRateLimitKey(request, 'api');
    expect(key).toBe('api:192.168.1.1');
  });

  it('uses default prefix', () => {
    const request = new Request('http://localhost');
    const key = getRateLimitKey(request);
    expect(key).toContain('api:');
  });

  it('handles missing headers', () => {
    const request = new Request('http://localhost');
    const key = getRateLimitKey(request, 'register');
    expect(key).toBe('register:unknown');
  });
});
