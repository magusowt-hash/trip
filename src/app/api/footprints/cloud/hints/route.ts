import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateFootprintRequest } from '@/app/api/footprints/_auth';
import { listCloudHints } from '@/services/footprint-cloud';

export async function GET(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemId = Number(searchParams.get('itemId'));
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: '缺少 itemId' }, { status: 400 });
  }

  try {
    const data = await listCloudHints(itemId, auth.userId);
    return NextResponse.json(data);
  } catch (err) {
    console.error('GET /api/footprints/cloud/hints error:', err);
    return NextResponse.json({ error: '获取未匹配提示失败' }, { status: 500 });
  }
}
