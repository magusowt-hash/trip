import { NextResponse } from 'next/server';
import { listPublicMapPackages } from '@/modules/maps/core/server/map-package-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = await listPublicMapPackages();
    return NextResponse.json(
      { list },
      { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },
    );
  } catch (error: any) {
    console.error('Public map packages GET error:', error);
    return NextResponse.json({ list: [] }, { status: 200 });
  }
}
