import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { db } from '@/db';
import { favorites, posts, users } from '@/db/schema';
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
    const userId = searchParams.get('userId');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    const whereClause = userId ? eq(favorites.userId, Number(userId)) : undefined;

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
      .where(whereClause)
      .orderBy(desc(favorites.createdAt))
      .limit(pageSize)
      .offset(offset);

    const countQuery = userId
      ? sql`SELECT COUNT(*) as cnt FROM favorites WHERE user_id = ${Number(userId)}`
      : sql`SELECT COUNT(*) as cnt FROM favorites`;
    const countResult = await db.execute(countQuery);
    const countRow = countResult as unknown as { cnt: number }[];
    const total = Number(countRow[0]?.cnt || 0);

    return NextResponse.json({ favorites: list, total });
  } catch (error) {
    console.error('Admin favorites error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
