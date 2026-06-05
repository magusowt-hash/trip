import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { chinaNatureTopics, type NatureTopicItem } from '../frontend/chinaNatureTopics';

export type ChinaNatureAdminTopic = NatureTopicItem;

let topicStore: ChinaNatureAdminTopic[] | null = null;

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
    coverImageUrl: topic.coverImageUrl,
    sortOrder: topic.sortOrder,
    isEnabled: topic.isEnabled,
  };
}

function getTopicStore(): ChinaNatureAdminTopic[] {
  if (!topicStore) {
    topicStore = chinaNatureTopics.map(cloneTopic);
  }

  return topicStore;
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
    coverImageUrl: typeof input.coverImageUrl === 'string' ? input.coverImageUrl : fallback.coverImageUrl,
    sortOrder: Number.isFinite(sortOrderValue) ? sortOrderValue : fallback.sortOrder,
    isEnabled: Boolean(input.isEnabled),
  };
}

export async function getChinaNatureAdminTopics(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) {
    return authError;
  }

  return NextResponse.json({
    topics: getTopicStore().map(cloneTopic),
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

    topicStore = inputTopics.map((topic, index) => normalizeTopic(topic, index));

    return NextResponse.json({
      topics: getTopicStore().map(cloneTopic),
    });
  } catch (error) {
    console.error('China nature topics PUT error:', error);
    return NextResponse.json({ error: '更新专题失败' }, { status: 500 });
  }
}
