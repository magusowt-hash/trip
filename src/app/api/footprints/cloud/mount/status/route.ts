import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateFootprintRequest } from '@/app/api/footprints/_auth';
import { getFootprintCloudStatus } from '@/services/footprint-cloud';

export async function GET(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemId = Number(searchParams.get('itemId'));
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: '缺少 itemId' }, { status: 400 });
  }

  try {
    const status = await getFootprintCloudStatus(itemId, auth.userId);
    if (!status) {
      return NextResponse.json({ error: '足迹项不存在' }, { status: 404 });
    }
    return NextResponse.json(status);
  } catch (err) {
    console.error('GET /api/footprints/cloud/mount/status error:', err);
    return NextResponse.json({ error: '获取挂载状态失败' }, { status: 500 });
  }
}
