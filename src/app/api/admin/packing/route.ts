import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { db } from '@/db';
import { packingCategories, packingTemplates } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 });

    const categories = await db
      .select()
      .from(packingCategories)
      .where(eq(packingCategories.status, 1))
      .orderBy(asc(packingCategories.orderNum));

    const allTemplates = await db
      .select()
      .from(packingTemplates)
      .where(eq(packingTemplates.status, 1))
      .orderBy(asc(packingTemplates.orderNum));

    return NextResponse.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        order_num: c.orderNum,
        templates: allTemplates
          .filter((t) => t.categoryId === c.id)
          .map((t) => ({
            id: t.id,
            name: t.name,
            category_id: t.categoryId,
            order_num: t.orderNum,
          })),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 });

    const body = await req.json();
    const { type, name, category_id, order_num } = body;

    if (type === 'category') {
      const [result] = await db
        .insert(packingCategories)
        .values({ name, orderNum: order_num || 0 })
        .$returningId();
      return NextResponse.json({ id: result.id });
    }

    if (type === 'template') {
      const [result] = await db
        .insert(packingTemplates)
        .values({ categoryId: category_id, name, orderNum: order_num || 0 })
        .$returningId();
      return NextResponse.json({ id: result.id });
    }

    return NextResponse.json({ error: '无效类型' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: '创建失败' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 });

    const body = await req.json();
    const { id, type, name, category_id, order_num } = body;

    if (type === 'category') {
      await db
        .update(packingCategories)
        .set({ name, orderNum: order_num })
        .where(eq(packingCategories.id, id));
    } else if (type === 'template') {
      await db
        .update(packingTemplates)
        .set({ name, categoryId: category_id, orderNum: order_num })
        .where(eq(packingTemplates.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: '未授权' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    const type = searchParams.get('type');

    if (type === 'category') {
      await db.update(packingCategories).set({ status: 0 }).where(eq(packingCategories.id, id));
    } else if (type === 'template') {
      await db.update(packingTemplates).set({ status: 0 }).where(eq(packingTemplates.id, id));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
