import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import bcrypt from 'bcryptjs';
import { decrypt } from '@/lib/encryption';

// GET - получить свой профиль (нужно для админки)
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        username: true,
        emailEncrypted: true,
        avatar: true,
        header: true,
        bio: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let email: string | null = null;
    try {
      email = decrypt(user.emailEncrypted);
    } catch {
      // ignore — может быть неверный ключ шифрования
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      email,
      avatar: user.avatar,
      header: user.header,
      bio: user.bio,
      role: user.role,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Error getting user:', error);
    return NextResponse.json({ error: 'Failed to get user' }, { status: 500 });
  }
}

// PUT - обновить свой профиль
export async function PUT(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    const body = await request.json();
    const { username, avatar, header, bio } = body;

    // Проверяем username на уникальность, если он меняется
    if (username && username !== session.user.name) {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return NextResponse.json(
          { error: 'Username already exists' },
          { status: 409 }
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        ...(username && { username }),
        ...(avatar !== undefined && { avatar }),
        ...(header !== undefined && { header }),
        ...(bio !== undefined && { bio }),
      },
      select: {
        id: true,
        username: true,
        emailEncrypted: true,
        avatar: true,
        header: true,
        bio: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: decrypt(updatedUser.emailEncrypted),
      avatar: updatedUser.avatar,
      header: updatedUser.header,
      bio: updatedUser.bio,
      createdAt: updatedUser.createdAt,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE - удалить свой аккаунт
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Каскадное удаление сработает автоматически благодаря onDelete: Cascade
    await prisma.user.delete({
      where: { id: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
