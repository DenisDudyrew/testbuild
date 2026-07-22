import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST /api/users/me/last-seen — обновить lastSeenAt текущего пользователя
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating last seen:', error);
    return NextResponse.json({ error: 'Failed to update last seen' }, { status: 500 });
  }
}
