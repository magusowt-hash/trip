import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { serveFile } from '@/services/storage';
import { authenticate } from '../_auth';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

function isAdmin(req: NextRequest): boolean {
  const token = getAdminTokenFromRequest(req);
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, ts] = decoded.split(':');
    return Date.now() - parseInt(ts) < 7 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  // Allow admin or authenticated user
  const admin = isAdmin(req);
  if (!admin) {
    const auth = await authenticate(req);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    if (!uid) return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    if (parseInt(uid) !== auth.userId) return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

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
      'Cache-Control': 'private, max-age=31536000',
    },
  });
}
