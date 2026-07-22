import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST - создать голосование
// Тело: { postId, question, options: string[], expiresInHours?: number }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { postId, question, options, expiresInHours } = body;

    if (!postId || !question || !options || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json({ error: 'Must have a question and at least 2 options' }, { status: 400 });
    }

    if (options.length > 10) {
      return NextResponse.json({ error: 'Maximum 10 options' }, { status: 400 });
    }

    // Проверяем, что пост принадлежит пользователю
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true },
    });

    if (!post || post.userId !== session.user.id) {
      return NextResponse.json({ error: 'Not your post' }, { status: 403 });
    }

    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    const poll = await prisma.poll.create({
      data: {
        postId,
        question,
        expiresAt,
        options: {
          create: options.map((text: string) => ({ text })),
        },
      },
      include: {
        options: {
          include: {
            _count: { select: { votes: true } },
          },
        },
      },
    });

    return NextResponse.json(poll, { status: 201 });
  } catch (error) {
    console.error('Error creating poll:', error);
    return NextResponse.json({ error: 'Failed to create poll' }, { status: 500 });
  }
}
