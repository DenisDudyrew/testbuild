import { NextResponse } from 'next/server';

// Socket.IO использует WebSocket upgrade, этот Route Handler
// только для health-check и fallback HTTP polling

export async function GET() {
  return NextResponse.json({ ok: true, message: 'Socket.IO endpoint' });
}

export async function POST() {
  return NextResponse.json({ ok: true, message: 'Socket.IO endpoint' });
}
