import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { db } from '@/db';
import { listImages } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

function verifyAdminToken(req: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');
    if (!timestamp) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const age = Date.now() - parseInt(timestamp);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const listId = searchParams.get('list_id');
    const id = searchParams.get('id');

    if (id) {
      const image = await db.select().from(listImages).where(eq(listImages.id, parseInt(id)));
      return NextResponse.json({ image: image[0] });
    }

    if (listId) {
      const images = await db
        .select()
        .from(listImages)
        .where(eq(listImages.listId, parseInt(listId)))
        .orderBy(desc(listImages.id));
      return NextResponse.json({ list: images });
    }

    // If no list_id, return all (maybe with pagination in future)
    const images = await db.select().from(listImages).orderBy(desc(listImages.id));
    return NextResponse.json({ list: images });
  } catch (error: any) {
    console.error('List images GET error:', error);
    return NextResponse.json({ error: '获取图片列表失败: ' + error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { listId, url, thumbnailUrl, caption, sortOrder } = body;

    if (!listId) {
      return NextResponse.json({ error: '缺少listId' }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: '图片URL不能为空' }, { status: 400 });
    }

    const result = await db.insert(listImages).values({
      listId: parseInt(listId),
      url,
      thumbnailUrl: thumbnailUrl || null,
      caption: caption || null,
      sortOrder: sortOrder !== undefined ? sortOrder : 0,
    });

    return NextResponse.json({ success: true, id: result[0].insertId });
  } catch (error: any) {
    console.error('List images POST error:', error);
    return NextResponse.json({ error: '创建图片失败: ' + error?.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    const { listId, url, thumbnailUrl, caption, sortOrder, ...rest } = body;
    const updateData: any = { ...rest, updatedAt: new Date() };
    if (listId !== undefined) updateData.listId = parseInt(listId);
    if (url !== undefined) updateData.url = url;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;
    if (caption !== undefined) updateData.caption = caption;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    delete updateData.id;

    await db.update(listImages).set(updateData).where(eq(listImages.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('List images PUT error:', error);
    return NextResponse.json({ error: '更新图片失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    await db.delete(listImages).where(eq(listImages.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('List images DELETE error:', error);
    return NextResponse.json({ error: '删除图片失败: ' + error?.message }, { status: 500 });
  }
}