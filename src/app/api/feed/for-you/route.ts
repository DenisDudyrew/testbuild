import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { feedCache } from '@/lib/cache';

// ============================================================
// FEED CONFIG
// ============================================================

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const FEED_DAYS = 7;
const FEED_SECONDS = FEED_DAYS * 24 * 60 * 60;

// Веса алгоритма
const LIKE_WEIGHT = 2;
const COMMENT_WEIGHT = 3;
const REPOST_WEIGHT = 1.5;

const ENGAGEMENT_MULTIPLIER = 10;
const RECENCY_MULTIPLIER = 50;

const FOLLOW_BONUS = 2;

// ============================================================
// GET /api/feed/for-you
//
// Алгоритм:
//
// engagement =
//   likes * 2 +
//   comments * 3 +
//   reposts * 1.5
//
// recency = 1 -> новый пост
// recency = 0 -> посту 7 дней
//
// score =
//   (engagement * 10 + recency * 50)
//   * followBonus
//
// followBonus:
//   2 - если пользователь подписан на автора
//   1 - иначе
//
// Пока используется page/offset pagination,
// чтобы не ломать существующий frontend.
// ============================================================

export async function GET(request: Request) {
  try {
    // ==========================================================
    // AUTH
    // ==========================================================

    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // ==========================================================
    // QUERY PARAMETERS
    // ==========================================================

    const url = new URL(request.url);

    const rawPage = Number(url.searchParams.get('page'));
    const rawLimit = Number(url.searchParams.get('limit'));

    // page >= 1
    const page =
      Number.isFinite(rawPage) && rawPage >= 1
        ? Math.floor(rawPage)
        : 1;

    // 1 <= limit <= 50
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1
        ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const skip = (page - 1) * limit;

    // ==========================================================
    // CACHE
    // ==========================================================

    const cacheKey = `feed:for-you:${userId}:${page}:${limit}`;

    const cached = feedCache().get(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    // ==========================================================
    // GET POST IDS + SCORE
    // ==========================================================
    //
    // ВАЖНО:
    //
    // 1. Сначала ограничиваемся постами последних 7 дней.
    //
    // 2. Likes / Comments / Reposts агрегируются только
    //    относительно этих постов.
    //
    // 3. Follow использует правильное имя таблицы:
    //    "follows"
    //
    // 4. Блокировки пользователей исключаются.
    //
    // 5. Score возвращается из SQL, поэтому frontend получает
    //    именно тот score, по которому была выполнена сортировка.
    //
    // 6. Добавлен стабильный порядок:
    //
    //      score DESC
    //      createdAt DESC
    //      id DESC
    //
    // ==========================================================

    const topPostIds = await prisma.$queryRaw<
      Array<{
        id: string;
        score: number;
        isFollowing: boolean;
      }>
    >`
      WITH recent_posts AS (
        SELECT
          p.id,
          p."userId",
          p."createdAt"
        FROM "Post" p
        WHERE p."createdAt" > NOW() - INTERVAL '7 days'

          -- Не показываем посты заблокированных пользователей
          AND NOT EXISTS (
            SELECT 1
            FROM "user_blocks" ub
            WHERE ub."blockerId" = ${userId}
              AND ub."blockedId" = p."userId"
          )

          -- И не показываем посты пользователя,
          -- который заблокировал текущего пользователя
          AND NOT EXISTS (
            SELECT 1
            FROM "user_blocks" ub
            WHERE ub."blockerId" = p."userId"
              AND ub."blockedId" = ${userId}
          )
      ),

      likes_count AS (
        SELECT
          l."postId",
          COUNT(*)::double precision AS count
        FROM "Like" l
        INNER JOIN recent_posts rp
          ON rp.id = l."postId"
        GROUP BY l."postId"
      ),

      comments_count AS (
        SELECT
          c."postId",
          COUNT(*)::double precision AS count
        FROM "Comment" c
        INNER JOIN recent_posts rp
          ON rp.id = c."postId"
        GROUP BY c."postId"
      ),

      reposts_count AS (
        SELECT
          r."repost_of_id" AS "postId",
          COUNT(*)::double precision AS count
        FROM "Post" r
        INNER JOIN recent_posts rp
          ON rp.id = r."repost_of_id"
        WHERE r."repost_of_id" IS NOT NULL
        GROUP BY r."repost_of_id"
      )

      SELECT
        p.id,

        (
          (
            COALESCE(lc.count, 0) * ${LIKE_WEIGHT}
            +
            COALESCE(cc.count, 0) * ${COMMENT_WEIGHT}
            +
            COALESCE(rc.count, 0) * ${REPOST_WEIGHT}
          ) * ${ENGAGEMENT_MULTIPLIER}

          +

          GREATEST(
            0,
            1 -
            EXTRACT(
              EPOCH FROM (NOW() - p."createdAt")
            ) / ${FEED_SECONDS}
          ) * ${RECENCY_MULTIPLIER}
        )

        *

        CASE
          WHEN f.id IS NOT NULL
            THEN ${FOLLOW_BONUS}
          ELSE 1
        END

        AS score,

        (f.id IS NOT NULL) AS "isFollowing"

      FROM recent_posts p

      LEFT JOIN likes_count lc
        ON lc."postId" = p.id

      LEFT JOIN comments_count cc
        ON cc."postId" = p.id

      LEFT JOIN reposts_count rc
        ON rc."postId" = p.id

      LEFT JOIN "follows" f
        ON f."followingId" = p."userId"
        AND f."followerId" = ${userId}

      ORDER BY
        score DESC,
        p."createdAt" DESC,
        p.id DESC

      LIMIT ${limit}
      OFFSET ${skip}
    `;

    // ==========================================================
    // TOTAL
    // ==========================================================
    //
    // Оставляем total ради совместимости с текущим frontend.
    //
    // Это количество доступных постов за последние 7 дней.
    // ==========================================================

    const countResult = await prisma.$queryRaw<
      Array<{
        total: bigint;
      }>
    >`
      SELECT COUNT(*)::bigint AS total
      FROM "Post" p
      WHERE p."createdAt" > NOW() - INTERVAL '7 days'

        AND NOT EXISTS (
          SELECT 1
          FROM "user_blocks" ub
          WHERE ub."blockerId" = ${userId}
            AND ub."blockedId" = p."userId"
        )

        AND NOT EXISTS (
          SELECT 1
          FROM "user_blocks" ub
          WHERE ub."blockerId" = p."userId"
            AND ub."blockedId" = ${userId}
        )
    `;

    const total = Number(
      countResult[0]?.total ?? 0
    );

    // ==========================================================
    // EMPTY
    // ==========================================================

    if (topPostIds.length === 0) {
      const emptyResult = {
        posts: [],
        total,
        page,
        limit,
      };

      feedCache().set(
        cacheKey,
        emptyResult
      );

      return NextResponse.json(emptyResult);
    }

    // ==========================================================
    // IDS
    // ==========================================================

    const postIdList = topPostIds.map(
      (item) => item.id
    );

    // Создаём Map со score из SQL
    const scoreMap = new Map(
      topPostIds.map((item) => [
        item.id,
        {
          score: Number(item.score),
          isFollowing: Boolean(item.isFollowing),
        },
      ])
    );

    // ==========================================================
    // LOAD POSTS
    // ==========================================================
    //
    // Здесь очень важно:
    //
    // likes:
    //   загружаем ТОЛЬКО лайк текущего пользователя.
    //
    // votes:
    //   загружаем ТОЛЬКО голос текущего пользователя.
    //
    // Это предотвращает огромные ответы для популярных постов.
    //
    // ==========================================================

    const rawPosts = await prisma.post.findMany({
      where: {
        id: {
          in: postIdList,
        },
      },

      include: {
        // ======================================================
        // AUTHOR
        // ======================================================

        user: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },

        // ======================================================
        // CURRENT USER LIKE
        // ======================================================

        likes: {
          where: {
            userId,
          },

          select: {
            userId: true,
          },

          take: 1,
        },

        // ======================================================
        // REPOSTED POST
        // ======================================================

        repostOf: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },

            // Только лайк текущего пользователя
            likes: {
              where: {
                userId,
              },

              select: {
                userId: true,
              },

              take: 1,
            },

            _count: {
              select: {
                likes: true,
                comments: true,
                reposts: true,
              },
            },
          },
        },

        // ======================================================
        // REPOSTED COMMENT
        // ======================================================

        repostedComment: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatar: true,
              },
            },

            _count: {
              select: {
                likes: true,
              },
            },

            post: {
              select: {
                id: true,
                content: true,
                mediaUrl: true,
                mediaType: true,
                createdAt: true,

                user: {
                  select: {
                    id: true,
                    username: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },

        // ======================================================
        // COUNTERS
        // ======================================================

        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
          },
        },

        // ======================================================
        // POLL
        // ======================================================

        poll: {
          select: {
            id: true,
            question: true,
            expiresAt: true,
            createdAt: true,

            options: {
              select: {
                id: true,
                text: true,

                // Только голос текущего пользователя
                votes: {
                  where: {
                    userId,
                  },

                  select: {
                    userId: true,
                  },

                  take: 1,
                },

                // Общее количество голосов
                _count: {
                  select: {
                    votes: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // ==========================================================
    // RESTORE SQL ORDER
    // ==========================================================

    const postMap = new Map(
      rawPosts.map((post) => [
        post.id,
        post,
      ])
    );

    const posts = postIdList
      .map((id) => postMap.get(id))
      .filter(
        (
          post
        ): post is NonNullable<typeof post> =>
          Boolean(post)
      );

    // ==========================================================
    // FORMAT RESPONSE
    // ==========================================================

    const scoredPosts = posts.map((post) => {
      const metadata = scoreMap.get(post.id);

      return {
        ...post,

        // Был ли пост лайкнут текущим пользователем
        isLiked: post.likes.length > 0,

        // Подписан ли пользователь на автора
        isFollowing:
          metadata?.isFollowing ?? false,

        // Score рассчитан непосредственно SQL.
        //
        // Больше нет расхождения:
        // SQL = 7 дней
        // TS = 3 дня
        //
        // Теперь используется ровно одно значение.
        _score:
          metadata?.score ?? 0,
      };
    });

    // ==========================================================
    // RESULT
    // ==========================================================

    const result = {
      posts: scoredPosts,
      total,
      page,
      limit,
    };

    // ==========================================================
    // CACHE
    // ==========================================================

    feedCache().set(
      cacheKey,
      result
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error(
      'Error fetching for-you feed:',
      error
    );

    return NextResponse.json(
      {
        error: 'Failed to fetch feed',
      },
      {
        status: 500,
      }
    );
  }
}