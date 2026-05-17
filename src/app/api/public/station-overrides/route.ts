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

    // 仅返回非 deleted 的覆盖（deleted 站用 level_override === 'deleted' 标记）
    const filtered = rows.filter(
      (r) => r.levelOverride !== 'deleted'
    );

    return NextResponse.json(
      filtered,
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  } catch (error: any) {
    console.error('Public station-overrides error:', error);
    return NextResponse.json([], { status: 200 });
  }
}
