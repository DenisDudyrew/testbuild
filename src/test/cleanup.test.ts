import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetMocks } from './helpers';

describe('cleanupPendingUsers', () => {
  beforeEach(() => {
    resetMocks();
    vi.useFakeTimers();
  });

  it('deletes pending users older than 5 minutes', async () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    mockPrisma.user.deleteMany.mockResolvedValue({ count: 3 });

    const { cleanupPendingUsers } = await import('@/lib/cleanup');
    const count = await cleanupPendingUsers();

    expect(count).toBe(3);

    const cutoff = new Date('2026-01-15T11:55:00Z');
    expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
      where: {
        emailVerified: false,
        createdAt: { lt: cutoff },
      },
    });
  });

  it('returns 0 when no pending users', async () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    mockPrisma.user.deleteMany.mockResolvedValue({ count: 0 });

    const { cleanupPendingUsers } = await import('@/lib/cleanup');
    const count = await cleanupPendingUsers();

    expect(count).toBe(0);
  });

  it('handles prisma error gracefully', async () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));

    mockPrisma.user.deleteMany.mockRejectedValue(new Error('DB error'));

    const { cleanupPendingUsers } = await import('@/lib/cleanup');
    await expect(cleanupPendingUsers()).rejects.toThrow('DB error');
  });
});
