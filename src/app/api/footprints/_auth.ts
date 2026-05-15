import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { verifyAuthToken, type AuthJwtPayload } from '@/server/auth/jwt';
import { getAuthTokenFromRequest } from '@/server/auth/cookies';

type AuthResult = {
  authorized: false;
  response: NextResponse;
  userId?: never;
} | {
  authorized: true;
  response?: never;
  userId: number;
}

export async function authenticate(req: NextRequest): Promise<AuthResult> {
  return authenticateFootprintRequest(req);
}

export async function authenticateFootprintRequest(req: NextRequest): Promise<AuthResult> {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return {
      authorized: false,
      response: NextResponse.json({ error: '未登录，请先登录' }, { status: 401 }),
    };
  }

  let payload: AuthJwtPayload;
  try {
    payload = await verifyAuthToken(token);
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: '未登录，请先登录' }, { status: 401 }),
    };
  }

  const userId = Number(payload.sub);
  if (!Number.isFinite(userId)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: '无效的用户ID' }, { status: 401 }),
    };
  }

  return { authorized: true, userId };
}
