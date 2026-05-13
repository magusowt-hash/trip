import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyAuthToken, type AuthJwtPayload } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

interface ListRecord {
  listId: number;
  listItemId: number;
  addedAt: string;
}

interface RatingRecord {
  listItemId: number;
  rating: number;
  addedAt: string;
}

interface UserListsBody {
  favoriteLists?: ListRecord[];
  ratings?: RatingRecord[];
}

export async function GET(req: NextRequest) {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ favoriteLists: [], ratings: [] }, { status: 200 });
    }

    let payload: AuthJwtPayload;
    try {
      payload = await verifyAuthToken(token);
    } catch {
      return NextResponse.json({ favoriteLists: [], ratings: [] }, { status: 200 });
    }
    
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ favoriteLists: [], ratings: [] }, { status: 200 });
    }

    const found = await db
      .select({
        favoriteLists: users.favoriteLists,
        ratings: users.ratings,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = found[0];
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      favoriteLists: user.favoriteLists || [],
      ratings: user.ratings || [],
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
  }

  let payload: AuthJwtPayload;
  try {
    payload = await verifyAuthToken(token);
  } catch {
    return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: '无效的用户ID' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as UserListsBody;
    const updateData: Record<string, unknown> = {};

    if (body.favoriteLists !== undefined) {
      updateData.favoriteLists = body.favoriteLists;
    }
    if (body.ratings !== undefined) {
      updateData.ratings = body.ratings;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '没有要更新的数据' }, { status: 400 });
    }

    await db.update(users).set(updateData).where(eq(users.id, userId));

    const updated = await db
      .select({
        favoriteLists: users.favoriteLists,
        ratings: users.ratings,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!updated[0]) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      favoriteLists: updated[0].favoriteLists || [],
      ratings: updated[0].ratings || [],
    }, { status: 200 });
  } catch (err) {
    console.error('User lists update error:', err);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}