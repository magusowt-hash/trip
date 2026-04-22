import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { lists } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const list = await db
      .select()
      .from(lists)
      .orderBy(desc(lists.id));

    return NextResponse.json({ list });
  } catch (error: any) {
    console.error('Lists GET error:', error);
    return NextResponse.json({ error: '获取榜单列表失败: ' + error?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, status } = body;

    if (!name) {
      return NextResponse.json({ error: '名称不能为空' }, { status: 400 });
    }

    const result = await db.insert(lists).values({
      name,
      description: description || null,
      status: status !== undefined ? status : 1,
    });

    return NextResponse.json({ success: true, id: result[0].insertId });
  } catch (error: any) {
    console.error('Lists POST error:', error);
    return NextResponse.json({ error: '创建榜单失败: ' + error?.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const body = await request.json();

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    const updateData: any = { ...body, updatedAt: new Date() };
    delete updateData.id;

    await db.update(lists).set(updateData).where(eq(lists.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Lists PUT error:', error);
    return NextResponse.json({ error: '更新榜单失败: ' + error?.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少ID' }, { status: 400 });
    }

    await db.delete(lists).where(eq(lists.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Lists DELETE error:', error);
    return NextResponse.json({ error: '删除榜单失败: ' + error?.message }, { status: 500 });
  }
}