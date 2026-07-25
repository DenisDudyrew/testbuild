import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { checkRateLimit, getRateLimitKey } from '@/lib/rate-limit';

// POST - toggle лайк
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limiting
    const rlKey = getRateLimitKey(request, 'like');
    const rl = await checkRateLimit(rlKey);
    if (!rl.success) {
      return NextResponse.json({ error: 'Слишком много запросов' }, { status: 429 });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const existingLike = await prisma.like.findUnique({
      where: { userId_postId: { userId: session.user.id, postId: id } },
    });

    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      // Get updated like count
      const likeCount = await prisma.like.count({
        where: { postId: id },
      });

      return NextResponse.json({ liked: false, _count: { likes: likeCount } });
    } else {
      const like = await prisma.like.create({
        data: { userId: session.user.id, postId: id },
      });

      if (post.userId !== session.user.id) {
        await prisma.notification.create({
          data: {
            userId: post.userId,
            type: 'like',
            actorId: session.user.id,
            postId: id,
            likeId: like.id,
          },
        });
      }

      // Get updated like count
      const likeCount = await prisma.like.count({
        where: { postId: id },
      });

      return NextResponse.json({ liked: true, _count: { likes: likeCount } });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}
