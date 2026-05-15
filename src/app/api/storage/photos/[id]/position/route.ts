import { NextResponse } from 'next/server';
import { updatePhotoPosition, batchUpdatePhotoPositions } from '@/services/storage';
import { authenticate } from '../../../_auth';

// PATCH — update single photo position
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  const fileId = parseInt(params.id);
  if (!Number.isFinite(fileId)) {
    return NextResponse.json({ error: '无效的文件ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { frame_x, frame_y } = body;

    await updatePhotoPosition(
      auth.userId,
      fileId,
      frame_x ?? null,
      frame_y ?? null,
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '更新失败' }, { status: 500 });
  }
}

// POST — batch update positions (for auto-layout)
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const { updates } = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: '缺少updates数组' }, { status: 400 });
    }

    await batchUpdatePhotoPositions(auth.userId, updates);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '更新失败' }, { status: 500 });
  }
}
