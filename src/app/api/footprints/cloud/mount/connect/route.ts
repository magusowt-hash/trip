import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authenticateFootprintRequest } from '@/app/api/footprints/_auth';
import { connectCloudMount, disconnectCloudMount } from '@/services/footprint-cloud';

export async function POST(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  try {
    const { itemId, rootPath } = await req.json() as { itemId?: number; rootPath?: string };
    if (!Number.isFinite(itemId) || !rootPath?.trim()) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 });
    }

    const status = await connectCloudMount(itemId, auth.userId, rootPath);
    return NextResponse.json({ success: true, status });
  } catch (err) {
    console.error('POST /api/footprints/cloud/mount/connect error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : '挂载失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const itemId = Number(searchParams.get('itemId'));
  if (!Number.isFinite(itemId)) {
    return NextResponse.json({ error: '缺少 itemId' }, { status: 400 });
  }

  try {
    await disconnectCloudMount(itemId, auth.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/footprints/cloud/mount/connect error:', err);
    return NextResponse.json({ error: '解除挂载失败' }, { status: 500 });
  }
}
