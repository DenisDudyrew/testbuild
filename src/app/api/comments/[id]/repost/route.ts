import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST - репостнуть комментарий
// Создаёт пост, который содержит ссылку на репостнутый комментарий
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

    const body = await request.json();
    const { content } = body;

    // Проверяем, что комментарий существует
    const originalComment = await prisma.comment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        postId: true,
        content: true,
        user: {
          select: { id: true, username: true, avatar: true },
        },
        _count: { select: { likes: true } },
        post: {
          select: {
            id: true,
            content: true,
            mediaUrl: true,
            mediaType: true,
            createdAt: true,
            user: { select: { id: true, username: true, avatar: true } },
          },
        },
      },
    });

    if (!originalComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Создаём репост-пост
    const repost = await prisma.post.create({
      data: {
        userId: session.user.id,
        content: content || '',
        repostedCommentId: id,
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true },
        },
        likes: { select: { userId: true } },
        repostedComment: {
          include: {
            user: { select: { id: true, username: true, avatar: true } },
            _count: { select: { likes: true } },
            post: {
              select: {
                id: true,
                content: true,
                mediaUrl: true,
                mediaType: true,
                createdAt: true,
                user: { select: { id: true, username: true, avatar: true } },
              },
            },
          },
        },
        _count: { select: { likes: true, comments: true, reposts: true } },
      },
    });

    // Отправляем уведомление автору комментария
    if (originalComment.userId !== session.user.id) {
      await prisma.notification.create({
        data: {
          userId: originalComment.userId,
          type: 'repost',
          actorId: session.user.id,
          postId: originalComment.postId,
          commentId: id,
        },
      });
    }

    return NextResponse.json(repost, { status: 201 });
  } catch (error) {
    console.error('Error reposting comment:', error);
    return NextResponse.json({ error: 'Failed to repost comment' }, { status: 500 });
  }
}
