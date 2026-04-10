import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');

export async function GET(request: NextRequest, { params }: { params: { userId: string } }) {
  const token = getAuthTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: '未登录，请先登录' }, { status: 401 });
  }

  let payload;
  try {
    payload = await verifyAuthToken(token);
  } catch {
    return NextResponse.json({ error: 'Token验证失败' }, { status: 401 });
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: '无效的用户ID' }, { status: 401 });
  }

  const cookieHeader = request.headers.get('Cookie') || '';

  try {
    const response = await fetch(`${BACKEND_URL}/api/message/conversation/${params.userId}`, {
      headers: {
        'Cookie': cookieHeader,
      },
      credentials: 'include',
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Backend get conversation error:', err);
    return NextResponse.json({ messages: [] });
  }
}