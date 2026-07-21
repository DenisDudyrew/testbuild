import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';


export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Популярные пользователи — больше всего постов
    const rawUsers = await prisma.user.findMany({
      where: { emailVerified: true },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
        _count: {
          select: {
            posts: true,
          },
        },
      },
      orderBy: {
        posts: {
          _count: 'desc',
        },
      },
      take: 5,
    });

    const popularUsers = rawUsers.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio,
      _count: u._count,
    }));

    // Популярные посты — больше всего лайков
    const popularPosts = await prisma.post.findMany({
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
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
          },
        },
      },
      orderBy: {
        likes: {
          _count: 'desc',
        },
      },
      take: 5,
    });

    return NextResponse.json({ popularUsers: popularUsers, popularPosts });
  } catch (error) {
    console.error('Error fetching explore data:', error);
    return NextResponse.json({ error: 'Failed to fetch explore data' }, { status: 500 });
  }
}
