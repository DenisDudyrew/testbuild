import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { feedCache } from '@/lib/cache';

// GET /api/feed/for-you - алгоритмическая лента
// Сортировка: (likes*2 + comments*3 + reposts*1.5) * 10 + recency * 50 * followBonus
// Использует raw SQL с оконной функцией для пагинации на уровне БД (без OOM)
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
    const userId = session.user.id;

    // Проверяем кэш
    const cacheKey = `feed:for-you:${userId}:${page}:${limit}`;
    const cached = feedCache().get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Получаем ID топ-постов через raw SQL с оконной функцией скоринга
    // Пагинация на уровне БД — ни один лишний пост не загружается
    const topPostIds = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT p.id
       FROM "Post" p
       LEFT JOIN (
         SELECT l."postId", COUNT(*) as likes_count
         FROM "Like" l
         GROUP BY l."postId"
       ) lc ON lc."postId" = p.id
       LEFT JOIN (
         SELECT c."postId", COUNT(*) as comments_count
         FROM "Comment" c
         GROUP BY c."postId"
       ) cc ON cc."postId" = p.id
       LEFT JOIN (
         SELECT r."repostOfId", COUNT(*) as reposts_count
         FROM "Post" r
         WHERE r."repostOfId" IS NOT NULL
         GROUP BY r."repostOfId"
       ) rc ON rc."repostOfId" = p.id
       LEFT JOIN "Follow" f ON f."followingId" = p."userId" AND f."followerId" = $1
       WHERE p."createdAt" > NOW() - INTERVAL '7 days'
       ORDER BY (
         (COALESCE(lc.likes_count, 0) * 2 + COALESCE(cc.comments_count, 0) * 3 + COALESCE(rc.reposts_count, 0) * 1.5) * 10 +
         GREATEST(0, 1 - EXTRACT(EPOCH FROM NOW() - p."createdAt") / 604800) * 50
       ) * CASE WHEN f.id IS NOT NULL THEN 2 ELSE 1 END DESC
       LIMIT $2 OFFSET $3`,
      userId,
      limit,
      skip,
    );

    // Собираем ID подписок для followBonus
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = new Set(following.map(f => f.followingId));

    // Получаем count постов для total (за последние 7 дней с активностью)
    const countResult = await prisma.$queryRawUnsafe<{ total: bigint }[]>(
      `SELECT COUNT(*) as total FROM "Post" p
       WHERE p."createdAt" > NOW() - INTERVAL '7 days'`
    );
    const total = Number(countResult[0]?.total ?? 0);

    // Если нет постов — возвращаем пустой результат
    if (topPostIds.length === 0) {
      const emptyResult = { posts: [], total, page, limit };
      feedCache().set(cacheKey, emptyResult);
      return NextResponse.json(emptyResult);
    }

    const postIdList = topPostIds.map(r => r.id);

    // До-загружаем полные данные постов по ID (сохраняя порядок сортировки)
    const rawPosts = await prisma.post.findMany({
      where: { id: { in: postIdList } },
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
    });

    // Восстанавливаем порядок сортировки из SQL
    const postMap = new Map(rawPosts.map(p => [p.id, p]));
    const posts = postIdList.map(id => postMap.get(id)).filter(Boolean);
    const now = Date.now();

    // Добавляем _score для клиента
    const scoredPosts = posts.map(post => {
      const hoursAge = (now - new Date(post!.createdAt).getTime()) / 3600000;
      const recency = Math.max(0, 1 - hoursAge / 72);
      const engagement = (post!._count.likes * 2 + post!._count.comments * 3 + post!._count.reposts * 1.5);
      const followBonus = followingIds.has(post!.userId) ? 2 : 1;
      return { ...post!, _score: (engagement * 10 + recency * 50) * followBonus };
    });

    const result = { posts: scoredPosts, total, page, limit };

    // Сохраняем в кэш на 60 секунд
    feedCache().set(cacheKey, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching for-you feed:', error);
    return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
  }
}
