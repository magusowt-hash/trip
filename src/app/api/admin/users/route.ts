import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, like, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const search = searchParams.get('search') || '';
    const offset = (page - 1) * pageSize;

    let whereCondition;
    if (search) {
      whereCondition = like(users.phone, `%${search}%`);
    }

    const list = await db
      .select({
        id: users.id,
        phone: users.phone,
        nickname: users.nickname,
        avatar: users.avatar,
        gender: users.gender,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(whereCondition)
      .orderBy(desc(users.id))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereCondition);
    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({ list, total });
  } catch (error: any) {
    console.error('Users GET error:', error);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    await db.delete(users).where(eq(users.id, parseInt(id)));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Users DELETE error:', error);
    return NextResponse.json({ error: '删除用户失败' }, { status: 500 });
  }
}