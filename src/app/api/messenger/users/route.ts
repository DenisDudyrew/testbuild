import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/messenger/users - поиск пользователей для нового чата
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        emailVerified: true,
        username: {
          contains: query,
          mode: 'insensitive',
        },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = users.length > limit;
    const resultUsers = hasMore ? users.slice(0, limit) : users;
    const nextCursor = hasMore ? resultUsers[resultUsers.length - 1]?.id : null;

    return NextResponse.json({ users: resultUsers, nextCursor });
  } catch (error) {
    console.error('Error searching messenger users:', error);
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
  }
}
