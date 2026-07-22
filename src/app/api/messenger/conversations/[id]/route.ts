import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET /api/messenger/conversations/[id] - получить один чат по ID
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

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const result = {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      participants: conversation.participants.map(p => ({
        id: p.user.id,
        username: p.user.username,
        avatar: p.user.avatar,
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}
