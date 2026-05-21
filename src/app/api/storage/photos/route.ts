import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  listPhotos,
  deletePhoto,
  getUserUsage,
  ensureScopedStorageForItem,
} from '@/services/storage';
import { authenticate } from '../_auth';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const scopeKey = searchParams.get('scope_key') || searchParams.get('place_title');
  const placeTitle = searchParams.get('place_title');
  const footprintItemId = Number(searchParams.get('footprint_item_id') || '');
  if (!scopeKey) return NextResponse.json({ error: '缺少地点范围' }, { status: 400 });

  try {
    if (placeTitle && Number.isFinite(footprintItemId)) {
      await ensureScopedStorageForItem(auth.userId, footprintItemId, placeTitle);
    }
    const photos = await listPhotos(auth.userId, scopeKey);
    const usage = await getUserUsage(auth.userId);
    return NextResponse.json({ photos, usage });
  } catch (err) {
    console.error('GET /api/storage/photos error:', err);
    return NextResponse.json({ error: '获取照片列表失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少文件ID' }, { status: 400 });

  try {
    await deletePhoto(auth.userId, parseInt(id));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '删除失败' }, { status: 500 });
  }
}
