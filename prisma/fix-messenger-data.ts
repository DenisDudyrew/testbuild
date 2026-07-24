/**
 * Скрипт для исправления данных мессенджера после миграций.
 * 
 * Что делает:
 * 1. Заполняет `searchContent` (plaintext) для старых сообщений, у которых он NULL
 * 2. Проверяет целостность ссылок в `pinned_messages` и `message_delivery_status`
 * 3. Удаляет битые записи (где ссылаются на несуществующие сообщения/пользователей)
 * 
 * Запуск: npx tsx prisma/fix-messenger-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Исправление данных мессенджера ===\n');

  // 1. Заполняем searchContent для старых сообщений
  console.log('1. Заполнение searchContent для старых сообщений...');
  const messagesWithoutSearch = await prisma.message.findMany({
    where: {
      searchContent: null,
      deletedAt: null,
    },
    select: { id: true, content: true },
  });

  console.log(`   Найдено сообщений без searchContent: ${messagesWithoutSearch.length}`);

  let fixedCount = 0;
  for (const msg of messagesWithoutSearch) {
    try {
      // Пробуем расшифровать, если не получается — пишем как есть
      let plaintext = msg.content;
      try {
        const { decrypt } = await import('../src/lib/encryption');
        plaintext = decrypt(msg.content);
      } catch {
        // Если расшифровка не удалась, оставляем как есть
      }

      await prisma.message.update({
        where: { id: msg.id },
        data: { searchContent: plaintext },
      });
      fixedCount++;
    } catch (error) {
      console.error(`   Ошибка обработки сообщения ${msg.id}:`, error);
    }
  }
  console.log(`   Исправлено: ${fixedCount}\n`);

  // 2. Проверяем целостность pinned_messages
  console.log('2. Проверка целостности pinned_messages...');
  const pinnedMessages = await prisma.pinnedMessage.findMany({
    select: { id: true, messageId: true, pinnedById: true, conversationId: true },
  });

  let brokenPinned = 0;
  for (const pm of pinnedMessages) {
    const messageExists = await prisma.message.findUnique({
      where: { id: pm.messageId },
      select: { id: true },
    });
    const userExists = await prisma.user.findUnique({
      where: { id: pm.pinnedById },
      select: { id: true },
    });
    const conversationExists = await prisma.conversation.findUnique({
      where: { id: pm.conversationId },
      select: { id: true },
    });

    if (!messageExists || !userExists || !conversationExists) {
      console.log(`   Удаление битого pinned_message ${pm.id}`);
      await prisma.pinnedMessage.delete({ where: { id: pm.id } });
      brokenPinned++;
    }
  }
  console.log(`   Удалено битых pinned_messages: ${brokenPinned}\n`);

  // 3. Проверяем целостность message_delivery_status
  console.log('3. Проверка целостности message_delivery_status...');
  const deliveryStatuses = await prisma.messageDeliveryStatus.findMany({
    select: { id: true, messageId: true, userId: true },
  });

  let brokenDelivery = 0;
  for (const ds of deliveryStatuses) {
    const messageExists = await prisma.message.findUnique({
      where: { id: ds.messageId },
      select: { id: true },
    });
    const userExists = await prisma.user.findUnique({
      where: { id: ds.userId },
      select: { id: true },
    });

    if (!messageExists || !userExists) {
      console.log(`   Удаление битого delivery_status ${ds.id}`);
      await prisma.messageDeliveryStatus.delete({ where: { id: ds.id } });
      brokenDelivery++;
    }
  }
  console.log(`   Удалено битых delivery_status: ${brokenDelivery}\n`);

  // 4. Проверяем участников диалогов
  console.log('4. Проверка участников диалогов...');
  const participants = await prisma.conversationParticipant.findMany({
    select: { conversationId: true, userId: true },
  });

  let brokenParticipants = 0;
  for (const p of participants) {
    const userExists = await prisma.user.findUnique({
      where: { id: p.userId },
      select: { id: true },
    });
    const conversationExists = await prisma.conversation.findUnique({
      where: { id: p.conversationId },
      select: { id: true },
    });

    if (!userExists || !conversationExists) {
      console.log(`   Удаление битого участника: conversation=${p.conversationId}, user=${p.userId}`);
      await prisma.conversationParticipant.delete({
        where: {
          conversationId_userId: {
            conversationId: p.conversationId,
            userId: p.userId,
          },
        },
      });
      brokenParticipants++;
    }
  }
  console.log(`   Удалено битых участников: ${brokenParticipants}\n`);

  console.log('=== Исправление завершено ===');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
