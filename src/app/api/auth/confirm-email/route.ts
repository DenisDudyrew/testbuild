import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cleanupPendingUsers } from '@/lib/cleanup';
import { hashEmail } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email и код обязательны' },
        { status: 400 }
      );
    }

    const emailHash = hashEmail(email);
    const user = await prisma.user.findUnique({ where: { emailHash } });

    if (!user) {
      return NextResponse.json(
        { error: 'Пользователь не найден' },
        { status: 404 }
      );
    }

    if (!user.verificationCode || !user.verificationCodeExpires) {
      return NextResponse.json(
        { error: 'Код не был отправлен. Запросите новый код.' },
        { status: 400 }
      );
    }

    if (user.verificationCodeExpires < new Date()) {
      return NextResponse.json(
        { error: 'Код истёк. Запросите новый код.' },
        { status: 400 }
      );
    }

    if (user.verificationCode !== code) {
      return NextResponse.json(
        { error: 'Неверный код. Попробуйте снова.' },
        { status: 400 }
      );
    }

    // Код верный — помечаем email как подтверждённый
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationCode: null,
        verificationCodeExpires: null,
      },
    });

    // Очищаем старые неподтверждённые записи (TTL 5 минут)
    await cleanupPendingUsers();

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error confirming email:', error);
    return NextResponse.json(
      { error: 'Не удалось подтвердить email' },
      { status: 500 }
    );
  }
}
