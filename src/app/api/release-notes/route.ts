import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET — публичный список всех release notes
export async function GET() {
  try {
    const notes = await prisma.releaseNote.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching release notes:', error);
    return NextResponse.json({ error: 'Failed to fetch release notes' }, { status: 500 });
  }
}
