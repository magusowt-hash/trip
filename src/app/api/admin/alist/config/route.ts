import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { alistConfig } from '@/db/schema';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { clearCache, testConnection } from '@/services/alist';

function verifyAdmin(req: NextRequest): NextResponse | null {
  const token = getAdminTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = Buffer.from(token, 'base64').toString();
    const [, ts] = d.split(':');
    if (!ts || Date.now() - parseInt(ts) > 7 * 24 * 3600 * 1000) return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  } catch { return NextResponse.json({ error: 'Invalid token' }, { status: 401 }); }
  return null;
}

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;
  const [row] = await db.select().from(alistConfig).limit(1);
  return NextResponse.json({ config: row || null });
}

export async function PUT(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;

  const { url, username, password, root_path, enabled } = await req.json();
  const existing = await db.select().from(alistConfig).limit(1);

  const values: Record<string, unknown> = {
    url: url || '',
    username: username || '',
    rootPath: root_path || '/',
    enabled: enabled ? 1 : 0,
    updatedAt: new Date(),
  };
  if (password) values.password = password;

  if (existing.length > 0) {
    await db.update(alistConfig).set(values as any).where(eq(alistConfig.id, existing[0].id));
  } else {
    await db.insert(alistConfig).values(values as any);
  }

  clearCache();
  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;
  const ok = await testConnection();
  return NextResponse.json({ connected: ok });
}
