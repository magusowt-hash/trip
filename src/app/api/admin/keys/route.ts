import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { db } from '@/db';
import { adminKeys } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';

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

function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const list = await db
      .select()
      .from(adminKeys)
      .orderBy(desc(adminKeys.createdAt))
      .limit(50);

    return NextResponse.json({ list });
  } catch (error: any) {
    return NextResponse.json({ error: '获取密钥列表失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { name, expiresDays } = await request.json();

    if (!name) {
      return NextResponse.json({ error: '请输入密钥名称' }, { status: 400 });
    }

    const key = generateKey();
    const keyHash = hashKey(key);
    const expiresAt = expiresDays
      ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await db
      .insert(adminKeys)
      .values({
        keyHash,
        name,
        expiresAt,
      })
      .$returningId();

    return NextResponse.json({ success: true, key, id: result[0].id });
  } catch (error: any) {
    return NextResponse.json({ error: '生成密钥失败' }, { status: 500 });
  }
}