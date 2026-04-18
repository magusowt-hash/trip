import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { plans, users } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const offset = (page - 1) * pageSize;
    const statusParam = searchParams.get('status');
    const allowedStatuses = ['normal', 'deleted'];
    let whereCondition = undefined;
    if (statusParam && statusParam !== 'all' && allowedStatuses.includes(statusParam)) {
      whereCondition = eq(plans.status, statusParam);
    }

    const list = await db
      .select({
        id: plans.id,
        userId: plans.userId,
        name: plans.name,
        startDate: plans.startDate,
        endDate: plans.endDate,
        status: plans.status,
        createdAt: plans.createdAt,
        userNickname: users.nickname,
        userPhone: users.phone,
      })
      .from(plans)
      .leftJoin(users, eq(plans.userId, users.id))
      .where(whereCondition)
      .orderBy(desc(plans.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.select({ count: sql<number>`count(*)` }).from(plans).where(whereCondition);
    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({ list, total });
  } catch (error: any) {
    console.error('Plans GET error:', error);
    return NextResponse.json({ error: '获取计划列表失败: ' + error?.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (!id) {
      return NextResponse.json({ error: '缺少计划ID' }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: '缺少操作类型' }, { status: 400 });
    }

    const planId = parseInt(id);

    if (action === 'soft-delete') {
      await db.update(plans)
        .set({ status: 'deleted' })
        .where(eq(plans.id, planId));
      return NextResponse.json({ success: true, message: '已删除' });
    }

    if (action === 'permanent-delete') {
      await db.delete(plans).where(eq(plans.id, planId));
      return NextResponse.json({ success: true, message: '已彻底删除' });
    }

    return NextResponse.json({ error: '无效操作' }, { status: 400 });
  } catch (error: any) {
    console.error('Plans PATCH error:', error);
    return NextResponse.json({ error: '操作失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少计划ID' }, { status: 400 });
    }

    await db.update(plans)
      .set({ status: 'deleted' })
      .where(eq(plans.id, parseInt(id)));

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error: any) {
    console.error('Plans DELETE error:', error);
    return NextResponse.json({ error: '删除失败: ' + error?.message }, { status: 500 });
  }
}