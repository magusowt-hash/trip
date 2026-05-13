import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { searchFolders, listFiles } from '@/services/alist';
import { authenticate } from '../_auth';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return (auth as any).response;

  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  const path = searchParams.get('path');

  try {
    if (path) {
      const files = await listFiles(auth.userId, path);
      return NextResponse.json({ files });
    }
    if (name) {
      const folders = await searchFolders(auth.userId, name);
      return NextResponse.json({ folders });
    }
    return NextResponse.json({ error: '需要 name 或 path 参数' }, { status: 400 });
  } catch (err) {
    console.error('GET /api/alist/folders error:', err);
    return NextResponse.json({ error: '获取文件列表失败' }, { status: 500 });
  }
}
