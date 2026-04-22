import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { favorites, posts } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

async function getCurrentUserId(request: NextRequest): Promise<number | null> {
  const token = getAuthTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = await verifyAuthToken(token);
    return Number(payload.sub);
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { id } = await params;
    const postId = Number(id);
    if (!postId || isNaN(postId)) {
      return NextResponse.json({ error: '无效的帖子ID' }, { status: 400 });
    }

    const existing = await db
      .select({ id: favorites.id })
      .from(favorites)
      .where(and(eq(favorites.postId, postId), eq(favorites.userId, userId)))
      .limit(1);

    let favorited: boolean;
    if (existing.length > 0) {
      await db.delete(favorites).where(eq(favorites.id, existing[0].id));
      favorited = false;
    } else {
      await db.insert(favorites).values({ postId, userId });
      favorited = true;
    }

    const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM favorites WHERE post_id = ${postId}`);
    const countRow = countResult as unknown as { cnt: number }[];
    const favoritesCnt = Number(countRow[0]?.cnt || 0);

    await db
      .update(posts)
      .set({ favoritesCnt })
      .where(eq(posts.id, postId));

    return NextResponse.json({ favorited, favoritesCnt });
  } catch (error) {
    console.error('Favorite error:', error);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
