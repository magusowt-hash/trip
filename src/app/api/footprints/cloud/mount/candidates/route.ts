import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateFootprintRequest } from '@/app/api/footprints/_auth';
import { listMountCandidates } from '@/services/footprint-cloud';

export async function GET(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemId = Number(searchParams.get('itemId'));
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: '缺少 itemId' }, { status: 400 });
  }

  try {
    const candidates = await listMountCandidates(auth.userId, itemId);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error('GET /api/footprints/cloud/mount/candidates error:', err);
    return NextResponse.json({ error: '获取候选目录失败' }, { status: 500 });
  }
}
