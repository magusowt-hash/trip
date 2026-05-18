import { NextResponse } from 'next/server';
import { db } from '@/db';
import { stationOverrides } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db
      .select({
        stationName: stationOverrides.stationName,
        displayName: stationOverrides.displayName,
        levelOverride: stationOverrides.levelOverride,
        displayLevel: stationOverrides.displayLevel,
      })
      .from(stationOverrides);

    return NextResponse.json(
      rows,
      {
        headers: {
          'Cache-Control': 'public, max-age=0, must-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Public station-overrides error:', error);
    return NextResponse.json([], { status: 200 });
  }
}
