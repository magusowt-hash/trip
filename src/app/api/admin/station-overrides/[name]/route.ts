import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { stationOverrides } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;

  try {
    const name = decodeURIComponent(params.name);
    
    await db
      .delete(stationOverrides)
      .where(eq(stationOverrides.stationName, name));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Station override DELETE error:', error);
    return NextResponse.json({ error: '删除失败: ' + error?.message }, { status: 500 });
  }
}
