import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { listItems } from '@/db/schema';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const body = await request.json();
    const { list_id, items } = body;

    if (!list_id || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    const results = [];
    for (const item of items) {
      const result = await db.insert(listItems).values({
        listId: list_id,
        title: item.title || '',
        coverImage: item.cover_image || null,
        description: item.description || null,
        lng: item.lng || null,
        lat: item.lat || null,
        address: item.address || null,
        orderNum: item.order_num || 0,
        status: 1,
      });
      results.push(result[0].insertId);
    }

    return NextResponse.json({ success: true, count: results.length, ids: results });
  } catch (error: any) {
    console.error('Batch import error:', error);
    return NextResponse.json({ error: '导入失败: ' + error?.message }, { status: 500 });
  }
}