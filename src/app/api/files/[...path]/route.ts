import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Раздача загруженных файлов (Next.js standalone не обслуживает public/uploads/ как статику)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = path.join(process.cwd(), 'public', 'uploads', ...pathSegments);

    // Защита от path traversal
    const resolved = path.resolve(filePath);
    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    if (!resolved.startsWith(uploadsDir)) {
      return new NextResponse('Forbidden', { status: 403 });
    }

    const buffer = await readFile(resolved);

    // Определяем MIME-тип по расширению
    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('File not found', { status: 404 });
  }
}
