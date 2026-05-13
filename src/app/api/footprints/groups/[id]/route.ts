import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups } from '@/db/schema';
import { authenticateFootprintRequest } from '../../_auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    const { name, is_default } = (await req.json()) as { name?: string; is_default?: boolean };

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: '分类组名不能为空' }, { status: 400 });
      }
      updateData.name = name.trim();
    }

    if (is_default === true) {
      await db
        .update(footprintGroups)
        .set({ isDefault: 0 })
        .where(eq(footprintGroups.userId, auth.userId));
      updateData.isDefault = 1;
    }

    await db.update(footprintGroups).set(updateData).where(eq(footprintGroups.id, groupId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('PATCH /api/footprints/groups/[id] error:', err);
    return NextResponse.json({ error: '更新分类组失败' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await authenticateFootprintRequest(req);
  if (!auth.authorized) return auth.response;

  const groupId = parseInt(params.id);
  if (!Number.isFinite(groupId)) {
    return NextResponse.json({ error: '无效的分类组ID' }, { status: 400 });
  }

  try {
    const [group] = await db
      .select()
      .from(footprintGroups)
      .where(eq(footprintGroups.id, groupId));
    if (!group || group.userId !== auth.userId) {
      return NextResponse.json({ error: '分类组不存在' }, { status: 404 });
    }

    await db.delete(footprintGroups).where(eq(footprintGroups.id, groupId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('DELETE /api/footprints/groups/[id] error:', err);
    return NextResponse.json({ error: '删除分类组失败' }, { status: 500 });
  }
}
