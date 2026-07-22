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

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Unpin any previously pinned post, then pin this one
    await prisma.post.updateMany({
      where: { userId: session.user.id, pinned: true },
      data: { pinned: false },
    });

    const updated = await prisma.post.update({
      where: { id },
      data: { pinned: !post.pinned },
    });

    return NextResponse.json({ pinned: updated.pinned });
  } catch (error) {
    console.error('Error toggling pin:', error);
    return NextResponse.json({ error: 'Failed to toggle pin' }, { status: 500 });
  }
}
