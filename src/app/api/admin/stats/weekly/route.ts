import { NextResponse } from 'next/server';
import { db } from '@/db';
import { users, posts, plans } from '@/db/schema';
import { sql, and, gte, eq } from 'drizzle-orm';

export async function GET() {
  try {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    
    // 生成近7天日期
    const weekDays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekAgo);
      d.setDate(d.getDate() + i);
      weekDays.push(d.toISOString().slice(0, 10));
    }

    const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    // 获取每日用户注册数
    const userCounts = await Promise.all(
      weekDays.map(async (day) => {
        const nextDay = new Date(day);
        nextDay.setDate(nextDay.getDate() + 1);
        
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(sql`DATE(created_at) = ${day}`);
        
        return result[0]?.count || 0;
      })
    );

    // 获取每日发帖数
    const postCounts = await Promise.all(
      weekDays.map(async (day) => {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(posts)
          .where(sql`DATE(created_at) = ${day}`);
        
        return result[0]?.count || 0;
      })
    );

    // 获取每日计划数
    const planCounts = await Promise.all(
      weekDays.map(async (day) => {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(plans)
          .where(sql`DATE(created_at) = ${day}`);
        
        return result[0]?.count || 0;
      })
    );

    return NextResponse.json({
      weekly: {
        dates: weekDays.map(d => formatDate(new Date(d))),
        users: userCounts,
        posts: postCounts,
        plans: planCounts,
      },
    });
  } catch (error) {
    console.error('Weekly stats error:', error);
    return NextResponse.json({ error: '获取周统计失败' }, { status: 500 });
  }
}