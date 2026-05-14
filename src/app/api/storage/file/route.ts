import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { serveFile } from '@/services/storage';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  const place = searchParams.get('place');
  const file = searchParams.get('file');

  if (!uid || !place || !file) return NextResponse.json({ error: '缺少参数' }, { status: 400 });

  const result = serveFile(uid, place, file);
  if (!result) return NextResponse.json({ error: '文件不存在' }, { status: 404 });

  return new NextResponse(result.buffer as any, {
    status: 200,
    headers: {
      'Content-Type': result.type,
      'Cache-Control': 'public, max-age=31536000',
    },
  });
}
