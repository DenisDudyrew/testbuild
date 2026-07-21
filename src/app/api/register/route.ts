import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { hashEmail } from '@/lib/encryption';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password, email } = body;

    if (!username || !password || !email) {
      return NextResponse.json(
        { error: 'Username, email and password are required' },
        { status: 400 }
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Логин должен быть минимум 3 символа' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Пароль должен быть минимум 6 символов' },
        { status: 400 }
      );
    }

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
