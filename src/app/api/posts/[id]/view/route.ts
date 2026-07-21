import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canIncrementView } from '@/lib/views';

// POST - увеличить счетчик просмотров (с защитой от накрутки через in-memory кеш)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.post.findUnique({
      where: { id },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Получаем IP для дедупликации
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';

    if (!canIncrementView(ip, id)) {
      // Возвращаем текущее значение, не увеличивая счётчик
      return NextResponse.json({ views: post.views });
    }

    const updatedPost = await prisma.post.update({
      where: { id },
      data: {
        views: {
          increment: 1,
        },
      },
    });

    return NextResponse.json({ views: updatedPost.views });
  } catch (error) {
    console.error('Error incrementing views:', error);
    return NextResponse.json({ error: 'Failed to increment views' }, { status: 500 });
  }
}
