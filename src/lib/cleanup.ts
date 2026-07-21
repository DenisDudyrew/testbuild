import { prisma } from './prisma';

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 минут

/**
 * Удаляет неподтверждённых пользователей (emailVerified = false),
 * которые были созданы более 5 минут назад.
 * Вызывается при отправке кода и подтверждении email.
 */
export async function cleanupPendingUsers(): Promise<number> {
  const cutoff = new Date(Date.now() - PENDING_TTL_MS);

  const result = await prisma.user.deleteMany({
    where: {
      emailVerified: false,
      createdAt: { lt: cutoff },
    },
  });

  return result.count;
}
