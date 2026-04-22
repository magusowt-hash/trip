import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { favorites, posts, users } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    const list = await db
      .select({
        id: favorites.id,
        postId: favorites.postId,
        userId: favorites.userId,
        createdAt: favorites.createdAt,
        postTitle: posts.title,
        userNickname: users.nickname,
      })
      .from(favorites)
      .leftJoin(posts, eq(favorites.postId, posts.id))
      .leftJoin(users, eq(favorites.userId, users.id))
      .orderBy(desc(favorites.createdAt))
      .limit(pageSize)
      .offset(offset);

    const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM favorites`);
    const countRow = countResult as unknown as { cnt: number }[];
    const total = Number(countRow[0]?.cnt || 0);

    return NextResponse.json({ favorites: list, total });
  } catch (error) {
    console.error('Admin favorites error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
