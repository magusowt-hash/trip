import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { saveFile, getUserUsage, ensureScopedStorageForItem } from '@/services/storage';
import { authenticate } from '../_auth';

const MAX_QUOTA = 5 * 1024 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const form = await req.formData();
    const scopeKey = form.get('scope_key') as string;
    const placeTitle = form.get('place_title') as string;
    const footprintItemId = Number(form.get('footprint_item_id') || '');
    const files = form.getAll('files') as File[];

    if (!scopeKey) return NextResponse.json({ error: '缺少地点范围' }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: '没有文件' }, { status: 400 });

    if (placeTitle && Number.isFinite(footprintItemId)) {
      await ensureScopedStorageForItem(auth.userId, footprintItemId, placeTitle);
    }

    const usage = Number(await getUserUsage(auth.userId));

    const results: { url: string; name: string; size: number }[] = [];
    let totalNew = 0;

    for (const file of files) {
      if (usage + totalNew + Number(file.size) > MAX_QUOTA) {
        return NextResponse.json({ error: `超出存储上限（5GB），已用 ${(usage / 1024 / 1024).toFixed(0)}MB`, results }, { status: 413 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const result = await saveFile(auth.userId, scopeKey, file.name, buf);
      results.push({ url: result.url, name: file.name, size: result.size });
      totalNew += result.size;
    }

    return NextResponse.json({ results, usage: usage + totalNew, quota: MAX_QUOTA }, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/storage/upload error:', err);
    return NextResponse.json({ error: err.message || '上传失败' }, { status: 500 });
  }
}
