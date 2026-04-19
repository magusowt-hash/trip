import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sql } from 'drizzle-orm';

function getCount(result: any): number {
  if (!result || !result[0]) return 0;
  const rows = result[0];
  if (!rows || rows.length === 0) return 0;
  return Number(rows[0]?.count || 0);
}

export async function GET() {
  try {
    const usersResult = await db.execute(sql`SELECT count(*) as count FROM users`);
    const postsResult = await db.execute(sql`SELECT count(*) as count FROM posts`);
    const commentsResult = await db.execute(sql`SELECT count(*) as count FROM comments`);
    const favoritesResult = await db.execute(sql`SELECT count(*) as count FROM favorites`);
    const friendsResult = await db.execute(sql`SELECT count(*) as count FROM friends`);
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