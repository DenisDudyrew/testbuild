import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST /api/messenger/messages/[messageId]/reactions — toggle emoji reaction
export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { messageId } = await params;
    const { emoji } = await request.json();

    if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
      return NextResponse.json({ error: 'Invalid emoji' }, { status: 400 });
    }

    // Проверяем, что сообщение существует и пользователь — участник чата
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        conversationId: true,
        conversation: {
          select: {
            participants: {
              where: { userId },
              select: { userId: true },
            },
          },
        },
      },
    });

    if (!message || message.conversation.participants.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Проверяем, есть ли уже такая реакция
    const existing = await prisma.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji,
        },
      },
    });

    if (existing) {
      // Удаляем (toggle off)
      await prisma.messageReaction.delete({
        where: { id: existing.id },
      });
      return NextResponse.json({ action: 'removed' });
    } else {
      // Добавляем
      await prisma.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji,
        },
      });
      return NextResponse.json({ action: 'added' }, { status: 201 });
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return NextResponse.json({ error: 'Failed to toggle reaction' }, { status: 500 });
  }
}
