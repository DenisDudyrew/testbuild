import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encrypt } from '@/lib/encryption';

// DELETE /api/messenger/messages/[messageId] — delete message
// Query params: mode=forMe | mode=forEveryone
export async function DELETE(
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

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'forMe';

    if (mode !== 'forMe' && mode !== 'forEveryone') {
      return NextResponse.json({ error: 'mode must be "forMe" or "forEveryone"' }, { status: 400 });
    }

    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, conversationId: true },
    });

    if (!msg) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Проверяем, что пользователь — участник чата
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId: msg.conversationId,
          userId,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (mode === 'forEveryone') {
      if (msg.senderId !== userId) {
        return NextResponse.json({ error: 'Only the sender can delete for everyone' }, { status: 403 });
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      return NextResponse.json({ success: true, mode: 'forEveryone' });
    }

    // mode=forMe
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedForUserId: userId },
    });

    return NextResponse.json({ success: true, mode: 'forMe' });
  } catch (error) {
    console.error('Error deleting message:', error);
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 });
  }
}

// PATCH /api/messenger/messages/[messageId] — edit message with editHistory
export async function PATCH(
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
    const { content } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Проверяем, что сообщение принадлежит пользователю
    const foundMessage = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, deletedAt: true, content: true },
    });

    if (!foundMessage || foundMessage.senderId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (foundMessage.deletedAt) {
      return NextResponse.json({ error: 'Cannot edit deleted message' }, { status: 400 });
    }

    const plaintext = content.trim();
    const encryptedContent = encrypt(plaintext);

    // Сохраняем старую версию в editHistory
    await prisma.messageEditHistory.create({
      data: {
        messageId,
        oldContent: foundMessage.content,
      },
    });

    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: encryptedContent,
        searchContent: plaintext,
        editedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      content: plaintext,
      editedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error editing message:', error);
    return NextResponse.json({ error: 'Failed to edit message' }, { status: 500 });
  }
}
