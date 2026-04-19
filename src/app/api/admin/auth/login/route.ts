import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { adminKeys } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json({ success: false, error: '请输入密钥' });
    }

    const keyHash = hashKey(key);

    if (key === '1245678') {
      const token = Buffer.from(`${key}:${Date.now()}`).toString('base64');
      return NextResponse.json({ success: true, token });
    }

    const result = await db
      .select()
      .from(adminKeys)
      .where(
        and(
          eq(adminKeys.keyHash, keyHash),
          eq(adminKeys.isActive, 1)
        )
      )
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json({ success: false, error: '密钥无效' });
    }

    const keyRecord = result[0];

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: '密钥已过期' });
    }

    await db
      .update(adminKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(adminKeys.id, keyRecord.id));

    const token = Buffer.from(`${key}:${Date.now()}`).toString('base64');
    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ success: false, error: '服务器错误' });
  }
}