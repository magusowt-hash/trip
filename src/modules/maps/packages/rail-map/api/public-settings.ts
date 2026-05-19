import { NextResponse } from 'next/server';
import { db } from '@/db';
import { railMapSettings } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function getRailMapPublicSettings() {
  try {
    const rows = await db.select().from(railMapSettings).limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { settings: null },
        { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },
      );
    }

    return NextResponse.json(
      { settings: rows[0] },
      { headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },
    );
  } catch (error: any) {
    console.error('Public rail-settings error:', error);
    return NextResponse.json({ settings: null }, { status: 200 });
  }
}

