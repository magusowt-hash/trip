import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { adminKeys } from '@/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';

function generateKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function GET(request: NextRequest) {
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
      .returning();

    return NextResponse.json({ success: true, key, id: result[0].id });
  } catch (error: any) {
    return NextResponse.json({ error: '生成密钥失败' }, { status: 500 });
  }
}