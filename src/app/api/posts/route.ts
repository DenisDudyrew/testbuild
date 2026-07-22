import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { createPostSchema, validate } from '@/lib/validation';

// GET - получить посты с пагинацией
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        skip,
        take: limit,
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
        orderBy: { createdAt: 'desc' },
      }),
      prisma.post.count(),
    ]);

    return NextResponse.json({ posts, total, page, limit });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}

// POST - создать новый пост
export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validate(createPostSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { content, mediaUrl, mediaType } = validation.data;

    if (!content && !mediaUrl) {
      return NextResponse.json(
        { error: 'Post must have content or media' },
        { status: 400 }
      );
    }

    const post = await prisma.post.create({
      data: {
        userId: session.user.id,
        content: content || '',
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
      },
      include: {
        user: {
          select: {
            username: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}
