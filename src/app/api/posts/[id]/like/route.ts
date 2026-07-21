import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

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

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Проверяем, есть ли уже лайк
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId: session.user.id,
          postId: id,
        },
      },
    });

    if (existingLike) {
      // Удаляем лайк
      await prisma.like.delete({
        where: {
          userId_postId: {
            userId: session.user.id,
            postId: id,
          },
        },
      });
      return NextResponse.json({ liked: false });
    } else {
      // Добавляем лайк
      const like = await prisma.like.create({
        data: {
          userId: session.user.id,
          postId: id,
        },
      });

      // Создаём уведомление, если лайк не свой
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

      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: 'Failed to toggle like' }, { status: 500 });
  }
}
