import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// POST - проголосовать
// Тело: { pollId, optionId }
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pollId, optionId } = body;

    if (!pollId || !optionId) {
      return NextResponse.json({ error: 'pollId and optionId required' }, { status: 400 });
    }

    // Проверяем, что option принадлежит poll
    const option = await prisma.pollOption.findUnique({
      where: { id: optionId },
      select: { pollId: true },
    });

    if (!option || option.pollId !== pollId) {
      return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
    }

    // Проверяем, не истёк ли poll
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      select: { expiresAt: true },
    });

    if (poll?.expiresAt && new Date() > poll.expiresAt) {
      return NextResponse.json({ error: 'Poll has expired' }, { status: 400 });
    }

    // Удаляем старый голос пользователя (если был) и создаём новый
    const existingVote = await prisma.vote.findFirst({
      where: {
        userId: session.user.id,
        option: { pollId },
      },
      include: { option: true },
    });

    if (existingVote) {
      if (existingVote.optionId === optionId) {
        // Кликнул на тот же вариант — отменяем голос
        await prisma.vote.delete({ where: { id: existingVote.id } });
        return NextResponse.json({ voted: false, optionId: null });
      }
      // Удаляем старый голос (переголосование)
      await prisma.vote.delete({ where: { id: existingVote.id } });
    }

    // Создаём новый голос
    await prisma.vote.create({
      data: {
        optionId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ voted: true, optionId });
  } catch (error) {
    console.error('Error voting:', error);
    return NextResponse.json({ error: 'Failed to vote' }, { status: 500 });
  }
}

// GET - получить результаты голосования
// Query: pollId
export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const pollId = url.searchParams.get('pollId');

    if (!pollId) {
      return NextResponse.json({ error: 'pollId required' }, { status: 400 });
    }

    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: {
          include: {
            _count: { select: { votes: true } },
            votes: {
              where: { userId: session.user.id },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!poll) {
      return NextResponse.json({ error: 'Poll not found' }, { status: 404 });
    }

    const votedOptionId = poll.options.find(
      (o) => o.votes.length > 0
    )?.id || null;

    const result = {
      ...poll,
      options: poll.options.map((o) => ({
        id: o.id,
        text: o.text,
        _count: o._count,
        voted: o.votes.length > 0,
      })),
      votedOptionId,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching poll:', error);
    return NextResponse.json({ error: 'Failed to fetch poll' }, { status: 500 });
  }
}
