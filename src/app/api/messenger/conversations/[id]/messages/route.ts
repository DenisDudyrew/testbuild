import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { encrypt, decrypt } from '@/lib/encryption';
import { sendMessageSchema } from '@/lib/validation';
import { checkRateLimit, getRateLimitKey, getStrictConfig } from '@/lib/rate-limit';

// GET /api/messenger/conversations/[id]/messages
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

    // Проверяем, что пользователь участник чата
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        OR: [
          { deletedForUserId: null },
          { deletedForUserId: { not: userId } },
        ],
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            senderId: true,
            sender: {
              select: { id: true, username: true },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        forwardFrom: {
          include: {
            sender: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
        deliveryStatuses: {
          select: {
            userId: true,
            status: true,
            readAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const resultMessages = hasMore ? messages.slice(0, limit) : messages;

    // Дешифруем содержимое сообщений
    const decryptedMessages = resultMessages.map(msg => ({
      ...msg,
      content: (() => {
        try { return decrypt(msg.content); } catch { return msg.content; }
      })(),
      replyTo: msg.replyTo ? {
        ...msg.replyTo,
        content: (() => {
          try { return decrypt(msg.replyTo.content); } catch { return msg.replyTo.content; }
        })(),
      } : null,
      forwardFrom: msg.forwardFrom ? {
        ...msg.forwardFrom,
        content: (() => {
          try { return decrypt(msg.forwardFrom.content); } catch { return msg.forwardFrom.content; }
        })(),
      } : null,
    }));

    // Обновляем lastReadAt
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });

    const reversedMessages = decryptedMessages.reverse();
    const nextCursor = hasMore && reversedMessages.length > 0 
      ? reversedMessages[0].createdAt.toISOString() 
      : null;

    // Получаем закрепленные сообщения
    const pinnedMessages = await prisma.pinnedMessage.findMany({
      where: { conversationId },
      include: {
        message: {
          include: {
            sender: {
              select: { id: true, username: true, avatar: true },
            },
          },
        },
      },
      orderBy: { pinnedAt: 'desc' },
      take: 10,
    });

    const decryptedPinnedMessages = pinnedMessages.map(pm => ({
      ...pm.message,
      content: (() => {
        try { return decrypt(pm.message.content); } catch { return pm.message.content; }
      })(),
    }));

    return NextResponse.json({
      messages: reversedMessages,
      nextCursor,
      pinnedMessages: decryptedPinnedMessages,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

// POST /api/messenger/conversations/[id]/messages - отправить сообщение
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

    // Rate limiting
    const rateLimitKey = getRateLimitKey(request, 'messenger:send');
    const rateLimitResult = await checkRateLimit(rateLimitKey, getStrictConfig());
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)),
          },
        }
      );
    }

    const { id: conversationId } = await params;

    // Проверяем участника
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!participant) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const validation = sendMessageSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0]?.message || 'Validation error' }, { status: 400 });
    }

    const { content, replyToId, mediaUrl, mediaType, mediaName, forwardFromId } = validation.data;

    if ((!content || !content.trim()) && !mediaUrl && !forwardFromId) {
      return NextResponse.json({ error: 'Content or media is required' }, { status: 400 });
    }

    const plaintext = content?.trim() || '';

    // Шифруем содержимое сообщения перед сохранением
    const encryptedContent = plaintext ? encrypt(plaintext) : '';

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: encryptedContent,
        searchContent: plaintext || null,
        replyToId: replyToId || null,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: mediaName || null,
        forwardFromId: forwardFromId || null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
        forwardFrom: {
          select: {
            id: true,
            content: true,
            senderId: true,
            sender: {
              select: { id: true, username: true },
            },
            createdAt: true,
          },
        },
      },
    });

    // Обновляем lastMessageAt
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    // Обновляем lastReadAt для отправителя
    await prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      data: { lastReadAt: new Date() },
    });

    // Создаём deliveryStatus для всех участников чата
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });

    await prisma.messageDeliveryStatus.createMany({
      data: participants.map(p => ({
        messageId: message.id,
        userId: p.userId,
        status: p.userId === userId ? 'sent' : 'delivered',
      })),
    });

    // Расшифровываем содержимое перед отправкой клиенту
    const decryptedResponse = {
      ...message,
      content: (() => {
        try { return decrypt(message.content); } catch { return message.content; }
      })(),
      forwardFrom: message.forwardFrom ? {
        ...message.forwardFrom,
        content: (() => {
          try { return decrypt(message.forwardFrom.content); } catch { return message.forwardFrom.content; }
        })(),
      } : null,
    };

    return NextResponse.json(decryptedResponse, { status: 201 });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
