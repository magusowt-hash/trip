import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { posts, users } from '@/db/schema';
import { eq, desc, sql, inArray } from 'drizzle-orm';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const offset = (page - 1) * pageSize;
    const statusParam = searchParams.get('status');
    const allowedStatuses = ['normal', 'blocked', 'deleted'];
    let whereCondition = undefined;
    if (statusParam && statusParam !== 'all' && allowedStatuses.includes(statusParam)) {
      whereCondition = eq(posts.status, statusParam);
    }

    const list = await db
      .select({
        id: posts.id,
        userId: posts.userId,
        title: posts.title,
        content: posts.content,
        privacy: posts.privacy,
        topic: posts.topic,
        createdAt: posts.createdAt,
        userNickname: users.nickname,
        userPhone: users.phone,
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(whereCondition)
      .orderBy(desc(posts.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(posts).where(whereCondition);
    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({ list, total });
  } catch (error: any) {
    console.error('Posts GET error:', error);
    return NextResponse.json({ error: '获取帖子列表失败: ' + error?.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id) {
      return NextResponse.json({ error: '缺少帖子ID' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: '缺少操作类型' }, { status: 400 });
    }

    const postId = parseInt(id);

    if (action === 'block') {
      await db.update(posts)
        .set({ status: 'blocked', updatedAt: sql`NOW()` })
        .where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已屏蔽' });
    }

    if (action === 'restore') {
      await db.update(posts)
        .set({ status: 'normal', updatedAt: sql`NOW()` })
        .where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已恢复' });
    }

    if (action === 'soft-delete') {
      await db.update(posts)
        .set({ status: 'deleted', updatedAt: sql`NOW()` })
        .where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已删除' });
    }

    if (action === 'permanent-delete') {
      await db.delete(posts).where(eq(posts.id, postId));
      return NextResponse.json({ success: true, message: '已彻底删除' });
    }

    return NextResponse.json({ error: '无效操作' }, { status: 400 });
  } catch (error: any) {
    console.error('Posts PATCH error:', error);
    return NextResponse.json({ error: '操作失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids');

    if (ids) {
      // Batch delete
      const idArray = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      if (idArray.length === 0) {
        return NextResponse.json({ error: '无效的ID列表' }, { status: 400 });
      }
      await db.delete(posts).where(inArray(posts.id, idArray));
      return NextResponse.json({ success: true, message: `已删除 ${idArray.length} 条记录` });
    }

    if (!id) {
      return NextResponse.json({ error: '缺少帖子ID' }, { status: 400 });
    }

    await db.delete(posts).where(eq(posts.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Posts DELETE error:', error);
    return NextResponse.json({ error: '删除失败: ' + error?.message }, { status: 500 });
  }
}