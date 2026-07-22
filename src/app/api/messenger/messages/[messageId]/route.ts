import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encrypt } from '@/lib/encryption';

// PATCH /api/messenger/messages/[messageId] — edit message
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
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, deletedAt: true },
    });

    if (!message || message.senderId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (message.deletedAt) {
      return NextResponse.json({ error: 'Cannot edit deleted message' }, { status: 400 });
    }

    const encryptedContent = encrypt(content.trim());

    await prisma.message.update({
      where: { id: messageId },
      data: {
        content: encryptedContent,
        editedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error editing message:', error);
    return NextResponse.json({ error: 'Failed to edit message' }, { status: 500 });
  }
}
