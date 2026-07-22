import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST /api/messenger/conversations/[id]/pin — toggle pin/unpin a message
export async function POST(
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
    const { messageId } = await request.json();

    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    // Проверяем, что пользователь — участник чата
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Проверяем, что сообщение существует в этом чате
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });

    if (!message || message.conversationId !== conversationId) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Проверяем, есть ли уже пин
    const existing = await prisma.pinnedMessage.findUnique({
      where: {
        conversationId_messageId: { conversationId, messageId },
      },
    });

    if (existing) {
      // Unpin: удаляем запись
      await prisma.pinnedMessage.delete({
        where: { id: existing.id },
      });
      return NextResponse.json({ pinned: false });
    } else {
      // Pin: создаём запись
      await prisma.pinnedMessage.create({
        data: {
          conversationId,
          messageId,
          pinnedById: userId,
        },
      });
      return NextResponse.json({ pinned: true }, { status: 201 });
    }
  } catch (error) {
    console.error('Error toggling pin:', error);
    return NextResponse.json({ error: 'Failed to toggle pin' }, { status: 500 });
  }
}
