import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';


// GET - получить профиль пользователя
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        avatar: true,
        header: true,
        bio: true,
        createdAt: true,
        posts: {
          select: {
            id: true,
            content: true,
            mediaUrl: true,
            mediaType: true,
            views: true,
            createdAt: true,
            likes: {
              select: {
                userId: true,
              },
            },
            comments: {
              select: {
                id: true,
              },
            },
            repostOf: {
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
                likes: {
                  select: {
                    userId: true,
                  },
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
            repostedComment: {
              select: {
                id: true,
                content: true,
                createdAt: true,
                postId: true,
                user: { select: { id: true, username: true, avatar: true } },
                likes: { select: { userId: true } },
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
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            posts: true,
            likes: true,
            comments: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      header: user.header,
      bio: user.bio,
      createdAt: user.createdAt,
      posts: user.posts,
      _count: user._count,
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
