import { NextRequest, NextResponse } from 'next/server';
import { getAdminTokenFromRequest } from '@/server/auth/admin-cookies';
import { updateMapPackageRecord } from '@/modules/maps/core/server/map-package-service';

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
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 7 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  return null;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  const authError = verifyAdminToken(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const updated = await updateMapPackageRecord(params.slug, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      isEnabled: typeof body.isEnabled === 'boolean' ? body.isEnabled : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: '地图包不存在' }, { status: 404 });
    }

    return NextResponse.json({ item: updated });
  } catch (error: any) {
    console.error('Admin map package PUT error:', error);
    return NextResponse.json({ error: '更新地图包失败' }, { status: 500 });
  }
}

