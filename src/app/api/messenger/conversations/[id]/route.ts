import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

// GET /api/messenger/conversations/[id] - получить один чат по ID
export async function GET(
  _request: Request,
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
        pinnedMessages: {
          include: {
            message: {
              select: {
                id: true,
                content: true,
                createdAt: true,
                senderId: true,
                sender: {
                  select: { id: true, username: true },
                },
              },
            },
          },
          orderBy: { pinnedAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const participantRecord = conversation.participants.find(p => p.userId === userId);

    const result = {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      participants: conversation.participants.map(p => ({
        id: p.user.id,
        username: p.user.username,
        avatar: p.user.avatar,
      })),
      pinnedMessages: conversation.pinnedMessages.map(pm => ({
        id: pm.message.id,
        content: pm.message.content,
        createdAt: pm.message.createdAt,
        sender: pm.message.sender,
        pinnedBy: pm.pinnedById,
        pinnedAt: pm.pinnedAt,
      })),
      lastMessageAt: conversation.lastMessageAt,
      lastReadAt: participantRecord?.lastReadAt?.toISOString() || null,
      createdAt: conversation.createdAt,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 });
  }
}

// PATCH /api/messenger/conversations/[id] — обновить чат
export async function PATCH(
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

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type } = body;

    if (!name && !type) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const updateData: Record<string, string> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) {
      if (type !== 'direct' && type !== 'group') {
        return NextResponse.json({ error: 'type must be "direct" or "group"' }, { status: 400 });
      }

      // Только администраторы могут менять тип чата
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can change conversation type' }, { status: 403 });
      }

      updateData.type = type;
    }

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
      select: { id: true, type: true, name: true, lastMessageAt: true },
    });

    return NextResponse.json(conversation);
  } catch (error) {
    console.error('Error updating conversation:', error);
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 });
  }
}

// DELETE /api/messenger/conversations/[id] — удалить чат / выйти из чата
export async function DELETE(
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

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'leave';

    if (mode === 'delete') {
      const participantCount = await prisma.conversationParticipant.count({
        where: { conversationId },
      });

      if (participantCount > 1) {
        return NextResponse.json(
          { error: 'Cannot delete conversation with multiple participants. Use mode=leave instead.' },
          { status: 400 }
        );
      }

      await prisma.conversation.delete({ where: { id: conversationId } });
      return NextResponse.json({ success: true, mode: 'delete' });
    }

    // mode=leave
    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });

    return NextResponse.json({ success: true, mode: 'leave' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}
