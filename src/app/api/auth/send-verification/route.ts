import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendVerificationCode } from '@/lib/mail';
import { cleanupPendingUsers } from '@/lib/cleanup';
import { encrypt, hashEmail } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Некорректный email' },
        { status: 400 }
      );
    }

    const emailHash = hashEmail(email);

    // Проверяем, не занят ли email подтверждённым пользователем
    const existing = await prisma.user.findUnique({ where: { emailHash } });
    if (existing?.emailVerified) {
      return NextResponse.json(
        { error: 'Этот email уже используется' },
        { status: 409 }
      );
    }

    // Генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    // Удаляем старые неподтверждённые записи (TTL 5 минут)
    await cleanupPendingUsers();

    // Сохраняем код в БД (связываем с email, пользователь ещё не создан)
    // Используем отдельную модель для временных кодов
    // Для простоты сохраняем в самом пользователе, но его пока нет —
    // создадим временную запись с username=null, password=null
    // Используем upsert: если есть пользователь с таким email, обновляем код
    // Если нет — создаём временную запись
    const emailEncrypted = encrypt(email);

    await prisma.user.upsert({
      where: { emailHash },
      update: {
        verificationCode: code,
        verificationCodeExpires: expiresAt,
      },
      create: {
        emailHash,
        emailEncrypted,
        username: `__pending_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
        password: '__pending__',
        verificationCode: code,
        verificationCodeExpires: expiresAt,
        emailVerified: false,
      },
    });

    // Отправляем код на почту
    await sendVerificationCode(email, code);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error sending verification code:', error);
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
