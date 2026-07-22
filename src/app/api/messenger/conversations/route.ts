import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { decrypt } from '@/lib/encryption';

// GET /api/messenger/conversations - список чатов пользователя
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            mediaUrl: true,
            mediaType: true,
            mediaName: true,
            sender: {
              select: { id: true, username: true },
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
      orderBy: { lastMessageAt: 'desc' },
    });

    // Получаем непрочитанные счётчики
    const unreadCounts = await Promise.all(
      conversations.map(async (conv) => {
        const participant = conv.participants.find(p => p.userId === userId);
        if (!participant) return { conversationId: conv.id, count: 0 };

        const count = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            createdAt: { gt: participant.lastReadAt },
            deletedAt: null,
          },
        });
        return { conversationId: conv.id, count };
      })
    );

    const unreadMap = Object.fromEntries(
      unreadCounts.map(u => [u.conversationId, u.count])
    );

    const result = conversations.map(conv => ({
      id: conv.id,
      type: conv.type,
      name: conv.name,
      lastMessage: conv.messages[0] ? {
        ...conv.messages[0],
        content: (() => {
          try { return decrypt(conv.messages[0].content); }
          catch { return conv.messages[0].content; }
        })(),
      } : null,
      participants: conv.participants.map(p => ({
        id: p.user.id,
        username: p.user.username,
        avatar: p.user.avatar,
      })),
      unreadCount: unreadMap[conv.id] || 0,
      lastMessageAt: conv.lastMessageAt,
      pinnedMessages: conv.pinnedMessages.map(pm => ({
        id: pm.message.id,
        content: (() => {
          try { return decrypt(pm.message.content); }
          catch { return pm.message.content; }
        })(),
        createdAt: pm.message.createdAt,
        sender: pm.message.sender,
        pinnedBy: pm.pinnedById,
        pinnedAt: pm.pinnedAt,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
  }
}

// POST /api/messenger/conversations - создать новый чат
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { participantIds, name } = await request.json();

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json({ error: 'participantIds array is required' }, { status: 400 });
    }

    if (participantIds.includes(userId)) {
      return NextResponse.json({ error: 'Cannot include yourself in participantIds' }, { status: 400 });
    }

    const isGroup = participantIds.length > 1;

    // Для диалога (1 участник) проверяем существующий чат
    if (!isGroup && !name) {
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'direct',
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: participantIds[0] } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, username: true, avatar: true } },
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, content: true, createdAt: true, senderId: true },
          },
        },
      });

      if (existing) {
        const result = {
          id: existing.id,
          type: existing.type,
          name: existing.name,
          participants: existing.participants.map(p => ({
            id: p.user.id,
            username: p.user.username,
            avatar: p.user.avatar,
          })),
          lastMessage: existing.messages[0] || null,
          unreadCount: 0,
          lastMessageAt: existing.lastMessageAt,
        };
        return NextResponse.json(result, { status: 200 });
      }
    }

    // Если чат групповой и нет имени, генерируем из имён участников
    let conversationName = name || null;
    if (isGroup && !conversationName) {
      const participants = await prisma.user.findMany({
        where: { id: { in: [userId, ...participantIds] } },
        select: { username: true },
      });
      conversationName = participants.map(p => p.username).join(', ');
    }

    // Создаём новый чат
    const conversation = await prisma.conversation.create({
      data: {
        type: isGroup ? 'group' : 'direct',
        name: conversationName,
        participants: {
          create: [
            { userId },
            ...participantIds.map(id => ({ userId: id })),
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    const result = {
      id: conversation.id,
      type: conversation.type,
      name: conversation.name,
      participants: conversation.participants.map(p => ({
        id: p.user.id,
        username: p.user.username,
        avatar: p.user.avatar,
      })),
      lastMessage: null,
      unreadCount: 0,
      lastMessageAt: conversation.lastMessageAt,
    };

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
