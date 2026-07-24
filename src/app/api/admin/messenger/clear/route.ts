import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST /api/admin/messenger/clear - очистка всех данных мессенджера
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Проверяем, что пользователь — админ
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    // Очищаем все данные мессенджера в правильном порядке (учитывая внешние ключи)
    // 1. Сначала удаляем зависимости: delivery statuses, edit history, reactions
    await prisma.messageDeliveryStatus.deleteMany({});
    await prisma.messageEditHistory.deleteMany({});
    await prisma.messageReaction.deleteMany({});
    
    // 2. Удаляем закреплённые сообщения
    await prisma.pinnedMessage.deleteMany({});
    
    // 3. Удаляем сообщения (они удалятся каскадно через Conversation, но для порядка)
    await prisma.message.deleteMany({});
    
    // 4. Удаляем участников диалогов
    await prisma.conversationParticipant.deleteMany({});
    
    // 5. Удаляем сами диалоги
    await prisma.conversation.deleteMany({});

    console.log(`Admin ${session.user.id} cleared all messenger data`);

    return NextResponse.json({ 
      success: true, 
      message: 'Все данные мессенджера успешно очищены' 
    });
  } catch (error) {
    console.error('Error clearing messenger data:', error);
    return NextResponse.json({ 
      error: 'Failed to clear messenger data',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
