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
              },
            },
          },
          orderBy: { pinnedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Получаем непрочитанные счётчики одним запросом (raw query вместо N+1)
    const conversationIds = conversations.map(c => c.id);
    const unreadMap: Record<string, number> = {};

    if (conversationIds.length > 0) {
      try {
        const unreadRows: Array<{ conversationId: string; unread_count: bigint }> = await prisma.$queryRaw`
          SELECT
            m."conversationId",
            COUNT(*)::bigint AS unread_count
          FROM "Message" m
          WHERE m."conversationId" = ANY(${conversationIds}::text[])
            AND m."senderId" != ${userId}
            AND m."deletedAt" IS NULL
            AND (m."deletedForUserId" IS NULL OR m."deletedForUserId" != ${userId})
            AND m."createdAt" > (
              SELECT cp."lastReadAt"
              FROM "ConversationParticipant" cp
              WHERE cp."conversationId" = m."conversationId"
                AND cp."userId" = ${userId}
            )
          GROUP BY m."conversationId"
        `;

        for (const row of unreadRows) {
          unreadMap[row.conversationId] = Number(row.unread_count);
        }
      } catch (rawError) {
        console.error('Error fetching unread counts via raw query, falling back to individual queries:', rawError);
        // Fallback: получаем непрочитанные по одному
        for (const convId of conversationIds) {
          try {
            const participant = await prisma.conversationParticipant.findUnique({
              where: { conversationId_userId: { conversationId: convId, userId } },
              select: { lastReadAt: true },
            });
            const unreadCount = await prisma.message.count({
              where: {
                conversationId: convId,
                senderId: { not: userId },
                deletedAt: null,
                OR: [
                  { deletedForUserId: null },
                  { deletedForUserId: { not: userId } },
                ],
                createdAt: {
                  gt: participant?.lastReadAt || new Date(0),
                },
              },
            });
            unreadMap[convId] = unreadCount;
          } catch (fallbackError) {
            console.error(`Error fetching unread count for conversation ${convId}:`, fallbackError);
            unreadMap[convId] = 0;
          }
        }
      }
    }

    const result = conversations.map(conv => {
      // Безопасно расшифровываем последнее сообщение
      const lastMessage = conv.messages[0] ? {
        id: conv.messages[0].id,
        content: (() => {
          try { return decrypt(conv.messages[0].content); }
          catch { return conv.messages[0].content; }
        })(),
        createdAt: conv.messages[0].createdAt,
        senderId: conv.messages[0].senderId,
        mediaUrl: conv.messages[0].mediaUrl,
        mediaType: conv.messages[0].mediaType,
        mediaName: conv.messages[0].mediaName,
        sender: conv.messages[0].sender,
      } : null;

      // Безопасно загружаем pinnedMessages с обработкой ошибок
      const pinnedMessages = conv.pinnedMessages
        .filter(pm => pm.message !== null) // фильтруем, если сообщение удалено
        .map(pm => ({
          id: pm.message.id,
          content: (() => {
            try { return decrypt(pm.message.content); }
            catch { return pm.message.content; }
          })(),
          createdAt: pm.message.createdAt,
          senderId: pm.message.senderId,
          pinnedBy: pm.pinnedById,
          pinnedAt: pm.pinnedAt,
        }));

      return {
        id: conv.id,
        type: conv.type,
        name: conv.name,
        lastMessage,
        participants: conv.participants.map(p => ({
          id: p.user.id,
          username: p.user.username,
          avatar: p.user.avatar,
        })),
        unreadCount: unreadMap[conv.id] || 0,
        lastMessageAt: conv.lastMessageAt,
        pinnedMessages,
      };
    });

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
