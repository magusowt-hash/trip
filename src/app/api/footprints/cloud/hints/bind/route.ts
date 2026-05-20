import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateFootprintRequest } from '@/app/api/footprints/_auth';
import { bindUnmatchedFolderToItem } from '@/services/footprint-cloud';

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { itemId, folderId } = await req.json() as { itemId?: number; folderId?: string };
    if (!Number.isFinite(itemId) || !folderId?.trim()) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const result = await bindUnmatchedFolderToItem(itemId, auth.userId, folderId.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/footprints/cloud/hints/bind error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '绑定失败' }, { status: 500 });
  }
}
