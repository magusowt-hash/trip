import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

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

function getCount(result: any): number {
  if (!result || !result[0]) return 0;
  const rows = result[0];
  if (!rows || rows.length === 0) return 0;
  return Number(rows[0]?.count || 0);
}

async function getFriendCount() {
  try {
    return await db.execute(sql`SELECT count(*) as count FROM friendships`);
  } catch {
    return db.execute(sql`SELECT count(*) as count FROM friends`);
  }
}

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const usersResult = await db.execute(sql`SELECT count(*) as count FROM users`);
    const postsResult = await db.execute(sql`SELECT count(*) as count FROM posts`);
    const commentsResult = await db.execute(sql`SELECT count(*) as count FROM comments`);
    const favoritesResult = await db.execute(sql`SELECT count(*) as count FROM favorites`);
    const friendsResult = await getFriendCount();
    const plansResult = await db.execute(sql`SELECT count(*) as count FROM plans`);
    const keysResult = await db.execute(sql`SELECT count(*) as count FROM admin_keys WHERE is_active = 1`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayResult = await db.execute(sql`SELECT count(*) as count FROM users WHERE created_at >= ${today}`);

    return NextResponse.json({
      stats: {
        totalUsers: getCount(usersResult),
        todayUsers: getCount(todayResult),
        totalPosts: getCount(postsResult),
        totalComments: getCount(commentsResult),
        totalFavorites: getCount(favoritesResult),
        totalFriends: getCount(friendsResult),
        totalPlans: getCount(plansResult),
        activeKeys: getCount(keysResult),
      },
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: '获取统计数据失败: ' + error?.message }, { status: 500 });
  }
}
