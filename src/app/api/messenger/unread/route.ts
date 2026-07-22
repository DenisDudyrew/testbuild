import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/messenger/unread — общее количество непрочитанных сообщений
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Получаем все чаты пользователя
    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      select: {
        id: true,
        participants: {
          where: { userId },
          select: { lastReadAt: true },
        },
      },
    });

    // Считаем непрочитанные сообщения по каждому чату
    let totalUnread = 0;
    for (const conv of conversations) {
      const lastReadAt = conv.participants[0]?.lastReadAt || new Date(0);
      const count = await prisma.message.count({
        where: {
          conversationId: conv.id,
          senderId: { not: userId },
          createdAt: { gt: lastReadAt },
          deletedAt: null,
        },
      });
      totalUnread += count;
    }

    return NextResponse.json({ unreadCount: totalUnread });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 });
  }
}
