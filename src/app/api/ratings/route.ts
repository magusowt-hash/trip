import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { ratings } from '@/db/schema';
import { verifyAuthToken, type AuthJwtPayload } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get('targetType');
    const targetId = searchParams.get('targetId');
    const userIdParam = searchParams.get('userId');

    const token = getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    let payload: AuthJwtPayload;
    try {
      payload = await verifyAuthToken(token);
    } catch {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const currentUserId = Number(payload.sub);

    const userId = userIdParam ? Number(userIdParam) : currentUserId;

    if (targetType && targetId) {
      const row = await db
        .select()
        .from(ratings)
        .where(
          and(
            eq(ratings.userId, userId),
            eq(ratings.targetType, targetType),
            eq(ratings.targetId, Number(targetId))
          )
        )
        .limit(1);

      return NextResponse.json(
        row[0] ? { rating: row[0].rating, comment: row[0].comment } : { rating: 0, comment: null }
      );
    }

    const allRatings = await db
      .select()
      .from(ratings)
      .where(eq(ratings.userId, userId));

    return NextResponse.json({ ratings: allRatings });
  } catch (err) {
    console.error('Ratings GET error:', err);
    return NextResponse.json({ error: '获取评分失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    let payload: AuthJwtPayload;
    try {
      payload = await verifyAuthToken(token);
    } catch {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    const userId = Number(payload.sub);

    const body = await req.json();
    const { targetType, targetId, rating, comment } = body;

    if (!targetType || !targetId || rating === undefined) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const ratingVal = Number(rating);
    if (!Number.isInteger(ratingVal) || ratingVal < 0 || ratingVal > 10) {
      return NextResponse.json({ error: '评分必须在0-10之间' }, { status: 400 });
    }

    const existing = await db
      .select({ id: ratings.id })
      .from(ratings)
      .where(
        and(
          eq(ratings.userId, userId),
          eq(ratings.targetType, targetType),
          eq(ratings.targetId, Number(targetId))
        )
      )
      .limit(1);

    if (ratingVal === 0) {
      if (existing[0]) {
        await db.delete(ratings).where(eq(ratings.id, existing[0].id));
      }
      return NextResponse.json({ rating: 0, comment: null });
    }

    if (existing[0]) {
      await db
        .update(ratings)
        .set({ rating: ratingVal, comment: comment ?? null, updatedAt: new Date() })
        .where(eq(ratings.id, existing[0].id));
    } else {
      await db.insert(ratings).values({
        userId,
        targetType,
        targetId: Number(targetId),
        rating: ratingVal,
        comment: comment ?? null,
      });
    }

    return NextResponse.json({ rating: ratingVal, comment: comment ?? null });
  } catch (err) {
    console.error('Ratings POST error:', err);
    return NextResponse.json({ error: '保存评分失败' }, { status: 500 });
  }
}
