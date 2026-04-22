import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { favorites, posts } from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    const dbFavorites = await db
      .select({
        id: favorites.id,
        postId: favorites.postId,
        createdAt: favorites.createdAt,
        title: posts.title,
        coverImageUrl: posts.coverImageUrl,
        topic: posts.topic,
      })
      .from(favorites)
      .leftJoin(posts, eq(favorites.postId, posts.id))
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt))
      .limit(limit + 1);

    const hasMore = dbFavorites.length > limit;
    const sliced = hasMore ? dbFavorites.slice(0, limit) : dbFavorites;

    return NextResponse.json({
      favorites: sliced,
      nextCursor: hasMore ? String(sliced[sliced.length - 1]?.createdAt) : null,
      hasMore,
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
