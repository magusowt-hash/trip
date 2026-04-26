import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { db } from '@/db';
import { lists, listItems } from '@/db/schema';

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

interface EmbedAccessLog {
  id: number;
  ip: string;
  action: string;
  listId: number | null;
  itemId: number | null;
  userAgent: string;
  createdAt: string;
}

const LOG_FILE = join(process.cwd(), 'data', 'embed-logs.json');
const MAX_LOGS = 10000;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}

async function loadLogs(): Promise<EmbedAccessLog[]> {
  try {
    if (existsSync(LOG_FILE)) {
      const data = await readFile(LOG_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Load embed logs error:', e);
  }
  return [];
}

async function saveLogs(logs: EmbedAccessLog[]): Promise<void> {
  try {
    const dir = join(process.cwd(), 'data');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Save embed logs error:', e);
  }
}

export async function POST(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const { action, list_id, item_id } = body;

    if (!action) {
      return NextResponse.json({ error: '缺少 action' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || '';

    const logs = await loadLogs();
    const newLog: EmbedAccessLog = {
      id: logs.length > 0 ? Math.max(...logs.map(l => l.id)) + 1 : 1,
      ip,
      action,
      listId: list_id || null,
      itemId: item_id || null,
      userAgent,
      createdAt: new Date().toISOString(),
    };

    logs.push(newLog);

    if (logs.length > MAX_LOGS) {
      logs.splice(0, logs.length - MAX_LOGS);
    }

    await saveLogs(logs);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Embed access log error:', error);
    return NextResponse.json({ error: '记录失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const action = searchParams.get('action');

    const logs = await loadLogs();
    let filtered = logs.reverse();

    if (action) {
      filtered = filtered.filter(l => l.action === action);
    }

    const listIds = [...new Set(filtered.map(l => l.listId).filter(Boolean))] as number[];
    const itemIds = [...new Set(filtered.map(l => l.itemId).filter(Boolean))] as number[];

    let listMap: Record<number, string> = {};
    let itemMap: Record<number, string> = {};

    try {
      if (listIds.length > 0) {
        const allLists = await db.select({ id: lists.id, name: lists.name }).from(lists);
        allLists.forEach(l => { listMap[l.id] = l.name; });
      }
      if (itemIds.length > 0) {
        const allItems = await db.select({ id: listItems.id, title: listItems.title }).from(listItems);
        allItems.forEach(i => { itemMap[i.id] = i.title; });
      }
    } catch (e) {
      console.error('Name lookup error:', e);
    }

    const result = filtered.slice(0, limit).map(log => ({
      ...log,
      list_name: listMap[log.listId ?? -1] || null,
      item_name: itemMap[log.itemId ?? -1] || null,
    }));

    return NextResponse.json({ logs: result, total: result.length });
  } catch (error: any) {
    console.error('Embed access logs GET error:', error);
    return NextResponse.json({ error: '获取记录失败' }, { status: 500 });
  }
}