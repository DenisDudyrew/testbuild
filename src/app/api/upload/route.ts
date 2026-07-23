import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const EXT_MAP: Record<string, string> = {
  jpeg: 'jpg',
  jpg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
  mp4: 'mp4',
  webm: 'webm',
  pdf: 'pdf',
  doc: 'doc',
  docx: 'docx',
  txt: 'txt',
};

function sanitizeExtension(originalName: string): string {
  const ext = originalName.split('.').pop()?.toLowerCase() || '';
  return EXT_MAP[ext] || 'bin';
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM' },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Проверка на дубликат по хэшу SHA-256
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    // Проверяем, есть ли уже файл с таким хэшем
    let existingFilename: string | null = null;
    try {
      const files = await readdir(uploadDir);
      for (const f of files) {
        if (f.startsWith(fileHash)) {
          existingFilename = f;
          break;
        }
      }
    } catch {
      // Если прочитать не удалось, просто создаём новый
    }

    let filename: string;

    if (existingFilename) {
      filename = existingFilename;
    } else {
      const safeExt = sanitizeExtension(file.name);
      const random = crypto.randomBytes(4).toString('hex');
      filename = `${fileHash}-${random}.${safeExt}`;

      await writeFile(path.join(uploadDir, filename), buffer);
    }

    const mediaType = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('image/')
        ? 'image'
        : 'file';
    const mediaUrl = `/api/files/${filename}`;

    return NextResponse.json({ mediaUrl, mediaType, mediaName: file.name });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
