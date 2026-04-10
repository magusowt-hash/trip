import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3002').replace(/\/$/, '');

export async function GET(request: NextRequest) {
  const token = getAuthTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: '未登录，请先登录', code: 'NO_TOKEN' }, { status: 401 });
  }

  let payload;
  try {
    payload = await verifyAuthToken(token);
  } catch (err) {
    console.error('Token verify failed:', err);
    return NextResponse.json({ error: 'Token验证失败', code: 'INVALID_TOKEN' }, { status: 401 });
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: '无效的用户ID' }, { status: 401 });
  }

  const keyword = request.nextUrl.searchParams.get('keyword');
  if (!keyword) {
    return NextResponse.json({ users: [] });
  }

  const cookieHeader = request.headers.get('Cookie') || '';
  
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/user/search?keyword=${encodeURIComponent(keyword)}`,
      {
        method: 'GET',
        headers: {
          'Cookie': cookieHeader,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    );
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Backend search error:', err);
    return NextResponse.json({ users: [] });
  }
}
