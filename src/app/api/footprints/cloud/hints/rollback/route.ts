import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateFootprintRequest } from '@/app/api/footprints/_auth';
import { rollbackBoundFolderFromItem } from '@/services/footprint-cloud';

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { itemId } = await req.json() as { itemId?: number };
    if (!Number.isFinite(itemId)) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const result = await rollbackBoundFolderFromItem(itemId, auth.userId);
    return NextResponse.json(result);
  } catch (err) {
    console.error('POST /api/footprints/cloud/hints/rollback error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '回退失败' }, { status: 500 });
  }
}
