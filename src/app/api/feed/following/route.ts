import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/feed/following - лента подписок (хронологическая)
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    const skip = (page - 1) * limit;

    // Собираем ID подписок
    const following = await prisma.follow.findMany({
      where: { followerId: session.user.id },
      select: { followingId: true },
    });
    const followingIds = following.map(f => f.followingId);

    // Если ни на кого не подписан — возвращаем пустой результат
    if (followingIds.length === 0) {
      return NextResponse.json({ posts: [], total: 0, page, limit });
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { userId: { in: followingIds } },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, username: true, avatar: true } },
          likes: { select: { userId: true } },
          repostOf: {
            include: {
              user: { select: { id: true, username: true, avatar: true } },
              likes: { select: { userId: true } },
              _count: { select: { likes: true, comments: true, reposts: true } },
            },
          },
          repostedComment: {
            include: {
              user: { select: { id: true, username: true, avatar: true } },
              _count: { select: { likes: true } },
              post: {
                select: {
                  id: true, content: true, mediaUrl: true, mediaType: true, createdAt: true,
                  user: { select: { id: true, username: true, avatar: true } },
                },
              },
            },
          },
          _count: { select: { likes: true, comments: true, reposts: true } },
          poll: {
            select: {
              id: true, question: true, expiresAt: true, createdAt: true,
              options: {
                select: {
                  id: true, text: true,
                  votes: { select: { userId: true } },
                  _count: { select: { votes: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.post.count({ where: { userId: { in: followingIds } } }),
    ]);

    return NextResponse.json({ posts, total, page, limit });
  } catch (error) {
    console.error('Error fetching following feed:', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
