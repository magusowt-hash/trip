import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

interface UpdateProfileBody {
  nickname?: string;
  avatar?: string;
  gender?: number;
  birthday?: string;
  region?: string;
}

export async function GET(req: NextRequest) {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
    }

    const payload = await verifyAuthToken(token);
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: '无效的用户ID' }, { status: 401 });
    }

    const found = await db
      .select({
        id: users.id,
        phone: users.phone,
        nickname: users.nickname,
        avatar: users.avatar,
        gender: users.gender,
        birthday: users.birthday,
        region: users.region,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const user = found[0];
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ user }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const token = getAuthTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
    }

    const payload = await verifyAuthToken(token);
    const userId = Number(payload.sub);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: '无效的用户ID' }, { status: 401 });
    }

    const body = (await req.json()) as UpdateProfileBody;
    const updateData: Record<string, unknown> = {};

    if (body.nickname !== undefined) {
      updateData.nickname = body.nickname || null;
    }
    if (body.avatar !== undefined) {
      updateData.avatar = body.avatar || null;
    }
    if (body.gender !== undefined) {
      updateData.gender = body.gender ?? 0;
    }
    if (body.birthday !== undefined) {
      updateData.birthday = body.birthday || null;
    }
    if (body.region !== undefined) {
      updateData.region = body.region || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '没有要更新的数据' }, { status: 400 });
    }

    await db.update(users).set(updateData).where(eq(users.id, userId));

    const updated = await db
      .select({
        id: users.id,
        phone: users.phone,
        nickname: users.nickname,
        avatar: users.avatar,
        gender: users.gender,
        birthday: users.birthday,
        region: users.region,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!updated[0]) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({ user: updated[0] }, { status: 200 });
  } catch (err) {
    console.error('Profile update error:', err);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}
