import { describe, it, expect, beforeEach } from 'vitest';
import { canIncrementView, resetViewCache } from '../views';

describe('view tracking', () => {
  beforeEach(() => {
    resetViewCache();
  });

  it('allows first view for a post', () => {
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(true);
  });

  it('blocks duplicate view within cooldown period', () => {
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(true);
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(false);
  });

  it('allows view from different IP on same post', () => {
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(true);
    expect(canIncrementView('192.168.1.1', 'post-1')).toBe(true);
  });

  it('allows view from same IP on different post', () => {
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(true);
    expect(canIncrementView('127.0.0.1', 'post-2')).toBe(true);
  });

  it('allows view after reset', () => {
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(true);
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(false);
    resetViewCache();
    expect(canIncrementView('127.0.0.1', 'post-1')).toBe(true);
  });

  it('handles many different IPs on same post', () => {
    for (let i = 0; i < 100; i++) {
      expect(canIncrementView(`192.168.0.${i}`, 'post-1')).toBe(true);
    }
  });
});
