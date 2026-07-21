import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';


// GET - поиск пользователей по нику
export async function GET(request: Request) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    const users = await prisma.user.findMany({
      where: {
        emailVerified: true,
        ...(query ? {
          username: {
            contains: query,
            mode: 'insensitive',
          },
        } : {}),
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    const usersWithBio = users.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      bio: u.bio,
    }));

    return NextResponse.json(usersWithBio);
  } catch (error) {
    console.error('Error searching users:', error);
    return NextResponse.json({ error: 'Failed to search users' }, { status: 500 });
  }
}
