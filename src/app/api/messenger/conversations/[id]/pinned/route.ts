import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { decrypt } from '@/lib/encryption';

// GET /api/messenger/conversations/[id]/pinned — список закреплённых сообщений
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { id: conversationId } = await params;

    // Проверяем, что пользователь — участник чата
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const pinnedMessages = await prisma.pinnedMessage.findMany({
      where: { conversationId },
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
            reactions: {
              include: {
                user: {
                  select: { id: true, username: true },
                },
              },
            },
          },
        },
      },
      orderBy: { pinnedAt: 'desc' },
    });

    const messages = pinnedMessages.map((pm) => ({
      ...pm.message,
      content: (() => {
        try {
          return decrypt(pm.message.content);
        } catch {
          return pm.message.content;
        }
      })(),
      pinnedBy: {
        id: pm.pinnedById,
        pinnedAt: pm.pinnedAt,
      },
    }));

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error fetching pinned messages:', error);
    return NextResponse.json({ error: 'Failed to fetch pinned messages' }, { status: 500 });
  }
}
