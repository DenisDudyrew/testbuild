import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { searchMessagesSchema } from '@/lib/validation';

// GET /api/messenger/conversations/[id]/search?q= — поиск сообщений по searchContent
// searchContent хранит plaintext сообщения для возможности полнотекстового поиска
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

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    const validation = searchMessagesSchema.safeParse({ q: query });
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid search query' }, { status: 400 });
    }

    if (!query || !query.trim()) {
      return NextResponse.json({ messages: [] });
    }

    // Ищем сообщения по searchContent (незашифрованное поле) вместо зашифрованного content
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        NOT: { deletedForUserId: userId },
        searchContent: {
          contains: query.trim(),
          mode: 'insensitive',
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error searching messages:', error);
    return NextResponse.json({ error: 'Failed to search messages' }, { status: 500 });
  }
}
