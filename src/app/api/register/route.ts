import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { hashEmail } from '@/lib/encryption';
import { registerSchema, validate } from '@/lib/validation';
import { checkRateLimit, getRateLimitKey, getStrictConfig } from '@/lib/rate-limit';

export async function POST(request: Request) {
  try {
    // Rate limiting для регистрации
    const rlKey = getRateLimitKey(request, 'register');
    const rl = await checkRateLimit(rlKey, getStrictConfig());
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Слишком много попыток. Попробуйте позже.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetTime - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    
    const validation = validate(registerSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    
    const { username, password, email } = validation.data;

    const emailHash = hashEmail(email);

    // Проверяем, что есть пользователь с таким email и он подтверждён
    const pendingUser = await prisma.user.findUnique({
      where: { emailHash },
    });

    if (!pendingUser) {
      return NextResponse.json(
        { error: 'Сначала подтвердите email' },
        { status: 400 }
      );
    }

    if (!pendingUser.emailVerified) {
      return NextResponse.json(
        { error: 'Email не подтверждён' },
        { status: 400 }
      );
    }

    // Проверяем уникальность username
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUsername) {
      return NextResponse.json(
        { error: 'Пользователь с таким логином уже существует' },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Обновляем временную запись — заполняем username, password
    const user = await prisma.user.update({
      where: { id: pendingUser.id },
      data: {
        username,
        password: hashedPassword,
        verificationCode: null,
        verificationCodeExpires: null,
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        header: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error('Error registering user:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
