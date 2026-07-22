import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    const hashtag = url.searchParams.get('hashtag') || '';

    if (!q && !hashtag) {
      return NextResponse.json({ posts: [] });
    }

    const where: Prisma.PostWhereInput = {};

    if (hashtag) {
      where.hashtags = {
        some: { hashtag: { name: hashtag.toLowerCase() } },
      };
    }

    if (q) {
      where.content = { contains: q, mode: 'insensitive' };
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, avatar: true } },
        likes: { select: { userId: true } },
        _count: { select: { likes: true, comments: true, reposts: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Error searching posts:', error);
    return NextResponse.json({ error: 'Failed to search posts' }, { status: 500 });
  }
}
