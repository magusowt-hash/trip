import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, ratings, listItems } from '@/db/schema';
import { eq, like, desc, sql, and, inArray } from 'drizzle-orm';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

function getToken(req: NextRequest): string | null {
  const fromCookie = getAdminTokenFromRequest(req);
  if (fromCookie) return fromCookie;
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

function verifyAdminToken(req: NextRequest): NextResponse | null {
  const token = getToken(req);
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
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 10;
    const search = searchParams.get('search') || '';
    const userId = searchParams.get('userId');
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (userId) {
      conditions.push(eq(users.id, parseInt(userId)));
    }
    if (search) {
      conditions.push(like(users.phone, `%${search}%`));
    }

    let list = await db
      .select({
        id: users.id,
        phone: users.phone,
        nickname: users.nickname,
        avatar: users.avatar,
        gender: users.gender,
        region: users.region,
        favoriteLists: users.favoriteLists,
        visitedPlaces: users.visitedPlaces,
        ratings: users.ratings,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.id))
      .limit(pageSize)
      .offset(offset);

    if (userId) {
      const uid = parseInt(userId);
      const userRatings = await db
        .select()
        .from(ratings)
        .where(eq(ratings.userId, uid))
        .orderBy(desc(ratings.createdAt));

      const listItemIds = new Set<number>();
      for (const r of userRatings) {
        if (r.targetType === 'list_item') listItemIds.add(r.targetId);
      }

      const user = list[0];
      if (user) {
        const favs: any[] = (user.favoriteLists || []) as any[];
        const visits: any[] = (user.visitedPlaces || []) as any[];
        for (const f of favs) if (f.listItemId) listItemIds.add(f.listItemId);
        for (const v of visits) if (v.listItemId) listItemIds.add(v.listItemId);
      }

      const itemTitleMap = new Map<number, string>();
      if (listItemIds.size > 0) {
        const items = await db
          .select({ id: listItems.id, title: listItems.title })
          .from(listItems)
          .where(inArray(listItems.id, [...listItemIds]));
        for (const item of items) itemTitleMap.set(item.id, item.title);
      }

      const ratingDetails = userRatings.map(r => ({
        ...r,
        targetTitle: r.targetType === 'list_item' ? (itemTitleMap.get(r.targetId) || null) : null,
      }));

      const favoriteLists = list.map(u => {
        const favs: any[] = (u.favoriteLists || []) as any[];
        const favsWithTitle = favs.map((f: any) => ({
          listItemId: f.listItemId,
          addedAt: f.addedAt,
          title: itemTitleMap.get(f.listItemId) || null,
        }));
        return { ...u, favoriteLists: favsWithTitle, ratingDetails };
      });

      list = favoriteLists.map((u, idx) => {
        const visits: any[] = ((list[idx].visitedPlaces as any[]) || []) as any[];
        const visitedPlaces = visits.map((v: any) => ({
          listItemId: v.listItemId,
          addedAt: v.addedAt,
          title: itemTitleMap.get(v.listItemId) || null,
        }));
        return { ...u, visitedPlaces };
       });
      } else {
        const allRatings = await db.select({ uid: ratings.userId }).from(ratings);
        const ratingCountMap = new Map<number, number>();
        for (const r of allRatings) {
          ratingCountMap.set(r.uid, (ratingCountMap.get(r.uid) || 0) + 1);
        }
        list = list.map(u => ({ 
          ...u, 
          ratingsCnt: ratingCountMap.get(u.id) || 0,
          favoritesCnt: Array.isArray(u.favoriteLists) ? u.favoriteLists.length : 0,
          visitedCnt: Array.isArray(u.visitedPlaces) ? u.visitedPlaces.length : 0
        }));
      }

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({ list, total });
  } catch (error: any) {
    console.error('Users GET error:', error);
    return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  
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