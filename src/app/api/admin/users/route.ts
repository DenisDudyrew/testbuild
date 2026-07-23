import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { decrypt } from '@/lib/encryption';

function safeDecrypt(val: string): string | null {
  try {
    return decrypt(val);
  } catch {
    return null;
  }
}

// GET - получить всех пользователей (только admin)
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (currentUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rawUsers = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        emailEncrypted: true,
        avatar: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            posts: true,
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const users = rawUsers.map(u => ({
      id: u.id,
      username: u.username,
      email: safeDecrypt(u.emailEncrypted),
      avatar: u.avatar,
      role: u.role,
      createdAt: u.createdAt,
      _count: u._count,
    }));

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
