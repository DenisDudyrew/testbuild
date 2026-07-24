import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// GET /api/feed/for-you - алгоритмическая лента
// Сортировка: (likes*2 + comments*3 + recency_score)
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

    // Собираем ID подписок пользователя
    const following = await prisma.follow.findMany({
      where: { followerId: session.user.id },
      select: { followingId: true },
    });
    const followingIds = following.map(f => f.followingId);

    // Получаем ВСЕ посты (без пагинации) для корректной алгоритмической сортировки
    const allPosts = await prisma.post.findMany({
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
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
    });

    // Подсчитываем алгоритмический вес на стороне сервера
    const now = Date.now();
    const scored = allPosts.map(post => {
      const hoursAge = (now - new Date(post.createdAt).getTime()) / 3600000;
      const recency = Math.max(0, 1 - hoursAge / 72); // 0-1, затухает за 3 дня
      const engagement = (post._count.likes * 2 + post._count.comments * 3 + post._count.reposts * 1.5);
      const followBonus = followingIds.includes(post.userId) ? 2 : 1;
      const score = (engagement * 10 + recency * 50) * followBonus;
      return { ...post, _score: score };
    });

    // Сортируем по скорингу
    scored.sort((a, b) => b._score - a._score);

    // Пагинация ПОСЛЕ сортировки
    const paginatedPosts = scored.slice(skip, skip + limit);
    const total = scored.length;

    return NextResponse.json({ posts: paginatedPosts, total, page, limit });
  } catch (error) {
    console.error('Error fetching for-you feed:', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
