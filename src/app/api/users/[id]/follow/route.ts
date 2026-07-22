import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

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

    if (id === session.user.id) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    const existing = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: session.user.id, followingId: id } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
      return NextResponse.json({ followed: false });
    } else {
      await prisma.follow.create({
        data: { followerId: session.user.id, followingId: id },
      });
      return NextResponse.json({ followed: true });
    }
  } catch (error) {
    console.error('Error toggling follow:', error);
    return NextResponse.json({ error: 'Failed to toggle follow' }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    const [followerCount, followingCount, isFollowing] = await Promise.all([
      prisma.follow.count({ where: { followingId: id } }),
      prisma.follow.count({ where: { followerId: id } }),
      session?.user?.id
        ? prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: session.user.id, followingId: id } },
          }).then(Boolean)
        : Promise.resolve(false),
    ]);

    return NextResponse.json({ followerCount, followingCount, isFollowing });
  } catch (error) {
    console.error('Error fetching follow status:', error);
    return NextResponse.json({ error: 'Failed to fetch follow status' }, { status: 500 });
  }
}
