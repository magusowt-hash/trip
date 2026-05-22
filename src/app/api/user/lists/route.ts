import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { ratings, userListFavorites, users } from '@/db/schema';
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

    const [favoriteRows, ratingRows, found] = await Promise.all([
      db
        .select({
          listItemId: userListFavorites.listItemId,
          addedAt: userListFavorites.createdAt,
        })
        .from(userListFavorites)
        .where(eq(userListFavorites.userId, userId))
        .orderBy(desc(userListFavorites.createdAt)),
      db
        .select({
          listItemId: ratings.targetId,
          rating: ratings.rating,
          addedAt: ratings.createdAt,
        })
        .from(ratings)
        .where(and(eq(ratings.userId, userId), eq(ratings.targetType, 'list_item'))),
      db
        .select({
          id: users.id,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);

    if (!found[0]) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      favoriteLists: favoriteRows.map((row) => ({
        listItemId: row.listItemId,
        addedAt: row.addedAt instanceof Date ? row.addedAt.toISOString() : String(row.addedAt),
      })),
      ratings: ratingRows.map((row) => ({
        listItemId: row.listItemId,
        rating: row.rating,
        addedAt: row.addedAt instanceof Date ? row.addedAt.toISOString() : String(row.addedAt),
      })),
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
    if (body.favoriteLists === undefined && body.ratings === undefined) {
      return NextResponse.json({ error: '没有要更新的数据' }, { status: 400 });
    }

    if (body.favoriteLists !== undefined) {
      const nextIds = Array.from(new Set(body.favoriteLists.map((item) => item.listItemId).filter(Number.isFinite)));
      const existing = await db
        .select({
          id: userListFavorites.id,
          listItemId: userListFavorites.listItemId,
        })
        .from(userListFavorites)
        .where(eq(userListFavorites.userId, userId));

      const existingMap = new Map(existing.map((item) => [item.listItemId, item.id]));
      const toDelete = existing.filter((item) => !nextIds.includes(item.listItemId)).map((item) => item.id);
      const toInsert = nextIds.filter((itemId) => !existingMap.has(itemId));

      if (toDelete.length > 0) {
        await db.delete(userListFavorites).where(inArray(userListFavorites.id, toDelete));
      }

      if (toInsert.length > 0) {
        await db.insert(userListFavorites).values(
          toInsert.map((listItemId) => ({
            userId,
            listItemId,
          })),
        );
      }
    }

    if (body.ratings !== undefined) {
      await db.update(users).set({ ratings: body.ratings }).where(eq(users.id, userId));
    }

    const [favoritesRows, updated] = await Promise.all([
      db
        .select({
          listItemId: userListFavorites.listItemId,
          addedAt: userListFavorites.createdAt,
        })
        .from(userListFavorites)
        .where(eq(userListFavorites.userId, userId))
        .orderBy(desc(userListFavorites.createdAt)),
      db
        .select({
          ratings: users.ratings,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);

    if (!updated[0]) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      favoriteLists: favoritesRows.map((row) => ({
        listItemId: row.listItemId,
        addedAt: row.addedAt instanceof Date ? row.addedAt.toISOString() : String(row.addedAt),
      })),
      ratings: updated[0].ratings || [],
    }, { status: 200 });
  } catch (err) {
    console.error('User lists update error:', err);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
