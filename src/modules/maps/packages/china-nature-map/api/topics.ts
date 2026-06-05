import { NextRequest, NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { chinaNatureTopics as chinaNatureTopicsTable } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { chinaNatureTopics, type NatureTopicItem } from '../frontend/chinaNatureTopics';

export type ChinaNatureAdminTopic = NatureTopicItem;

function verifyAdminToken(request: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [, timestamp] = decoded.split(':');
    if (!timestamp) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const age = Date.now() - Number.parseInt(timestamp, 10);
    if (Number.isNaN(age) || age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return null;
}

function cloneTopic(topic: ChinaNatureAdminTopic): ChinaNatureAdminTopic {
  return {
    topicSlug: topic.topicSlug,
    title: topic.title,
    icon: topic.icon,
    sortOrder: topic.sortOrder,
    isEnabled: topic.isEnabled,
  };
}

async function ensureChinaNatureTopics() {
  const existing = await db.select().from(chinaNatureTopicsTable);
  if (existing.length > 0) {
    return;
  }

  await db.insert(chinaNatureTopicsTable).values(
    chinaNatureTopics.map((topic) => ({
      topicSlug: topic.topicSlug,
      title: topic.title,
      icon: topic.icon,
      sortOrder: topic.sortOrder,
      isEnabled: topic.isEnabled ? 1 : 0,
    })),
  );
}

function normalizeTopic(input: Partial<ChinaNatureAdminTopic>, index: number): ChinaNatureAdminTopic {
  const fallback = chinaNatureTopics[index] ?? chinaNatureTopics[0];
  const topicSlug = typeof input.topicSlug === 'string' && input.topicSlug.trim()
    ? input.topicSlug.trim()
    : fallback.topicSlug;

  const sortOrderValue = typeof input.sortOrder === 'number'
    ? input.sortOrder
    : Number.parseInt(String(input.sortOrder ?? fallback.sortOrder), 10);

  return {
    topicSlug,
    title: typeof input.title === 'string' ? input.title : fallback.title,
    icon: typeof input.icon === 'string' && input.icon.trim() ? input.icon.trim() : fallback.icon,
    sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : fallback.sortOrder,
    isEnabled: Boolean(input.isEnabled),
  };
}

async function listTopicsFromDb() {
  await ensureChinaNatureTopics();
  const rows = await db
    .select()
    .from(chinaNatureTopicsTable)
    .orderBy(asc(chinaNatureTopicsTable.sortOrder), asc(chinaNatureTopicsTable.id));

  return rows.map((row) => ({
    topicSlug: row.topicSlug,
    title: row.title,
    icon: row.icon,
    sortOrder: row.sortOrder,
    isEnabled: row.isEnabled === 1,
  }));
}

export async function getChinaNatureAdminTopics(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) {
    return authError;
  }

  return NextResponse.json({
    topics: (await listTopicsFromDb()).map(cloneTopic),
  });
}

export async function putChinaNatureAdminTopics(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) {
    return authError;
  }

  try {
    const body = await request.json();
    const inputTopics = Array.isArray(body?.topics) ? body.topics : null;

    if (!inputTopics) {
      return NextResponse.json({ error: 'Invalid topics payload' }, { status: 400 });
    }

    await ensureChinaNatureTopics();
    const normalized = inputTopics.map((topic, index) => normalizeTopic(topic, index));

    await db.delete(chinaNatureTopicsTable);
    await db.insert(chinaNatureTopicsTable).values(
      normalized.map((topic) => ({
        topicSlug: topic.topicSlug,
        title: topic.title,
        icon: topic.icon,
        sortOrder: topic.sortOrder,
        isEnabled: topic.isEnabled ? 1 : 0,
        updatedAt: new Date(),
      })),
    );

    return NextResponse.json({
      topics: (await listTopicsFromDb()).map(cloneTopic),
    });
  } catch (error) {
    console.error('China nature topics PUT error:', error);
    return NextResponse.json({ error: '更新项失败' }, { status: 500 });
  }
}
