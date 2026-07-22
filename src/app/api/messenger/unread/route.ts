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

    // Получаем все чаты пользователя с lastReadAt
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

    // Считаем непрочитанные параллельно (устраняем N+1)
    const unreadCounts = await Promise.all(
      conversations.map(async (conv) => {
        const lastReadAt = conv.participants[0]?.lastReadAt || new Date(0);
        return prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            createdAt: { gt: lastReadAt },
            deletedAt: null,
          },
        });
      })
    );

    const totalUnread = unreadCounts.reduce((sum, c) => sum + c, 0);

    return NextResponse.json({ unreadCount: totalUnread });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return NextResponse.json({ error: 'Failed to fetch unread count' }, { status: 500 });
  }
}
