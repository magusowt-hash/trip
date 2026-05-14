import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { serveFile } from '@/services/storage';
import { authenticate } from '../_auth';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  const place = searchParams.get('place');
  const file = searchParams.get('file');

  if (!uid || !place || !file) return NextResponse.json({ error: '缺少参数' }, { status: 400 });

  // Only serve files from authenticated user's own directory
  if (parseInt(uid) !== auth.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });

  const result = serveFile(uid, place, file);
  if (!result) return NextResponse.json({ error: '文件不存在' }, { status: 404 });

  return new NextResponse(result.buffer as any, {
    status: 200,
    headers: {
      'Content-Type': result.type,
      'Cache-Control': 'private, max-age=31536000',
    },
  });
}
