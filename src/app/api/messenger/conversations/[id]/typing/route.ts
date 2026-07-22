import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/messenger/conversations/[id]/typing — кто печатает
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

    // Проверяем участника
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Ищем участников, которые печатали в последние 8 секунд
    const eightSecondsAgo = new Date(Date.now() - 8000);

    const typingParticipants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: userId },
        typingAt: { gt: eightSecondsAgo },
      },
      select: {
        user: {
          select: { id: true, username: true },
        },
      },
    });

    return NextResponse.json({
      typing: typingParticipants.map((p) => p.user),
    });
  } catch (error) {
    console.error('Error fetching typing status:', error);
    return NextResponse.json({ error: 'Failed to fetch typing status' }, { status: 500 });
  }
}

// POST /api/messenger/conversations/[id]/typing — отметить печатание
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

    // Обновляем typingAt
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: { conversationId, userId },
      },
      data: { typingAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting typing status:', error);
    return NextResponse.json({ error: 'Failed to set typing status' }, { status: 500 });
  }
}
