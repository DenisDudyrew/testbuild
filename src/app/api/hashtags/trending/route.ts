import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const hashtags = await prisma.hashtag.findMany({
      include: {
        _count: { select: { posts: true } },
      },
      orderBy: { posts: { _count: 'desc' } },
      take: 10,
    });

    const result = (hashtags || []).map(h => ({
      name: h.name,
      count: h._count?.posts || 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching trending hashtags:', error);
    return NextResponse.json({ error: 'Failed to fetch trending hashtags' }, { status: 500 });
  }
}
