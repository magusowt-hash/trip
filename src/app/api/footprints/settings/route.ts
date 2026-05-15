import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userFootprintSettings } from '@/db/schema';
import { authenticate } from '../_auth';

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  const [row] = await db
    .select()
    .from(userFootprintSettings)
    .where(eq(userFootprintSettings.userId, auth.userId));

  if (!row) {
    return NextResponse.json({
      showPhotos: true, showLines: true, showLabels: true, showPoiLabels: true, showTitle: true, panelCollapsed: false,
      backgroundColor: '#0f172a', lineColor: '#a5b4fc', lineWidth: 2, lineDashed: true, poiLabelColor: '#000000', markerColor: '#ef4444', markerShape: 'pin',
    });
  }

  return NextResponse.json({
    showPhotos: !!row.showPhotos,
    showLines: !!row.showLines,
    showLabels: !!row.showLabels,
    showPoiLabels: !!row.showPoiLabels,
    poiLabelColor: row.poiLabelColor,
    markerColor: row.markerColor,
    markerShape: row.markerShape,
    showTitle: !!row.showTitle,
    panelCollapsed: !!row.panelCollapsed,
    backgroundColor: row.backgroundColor,
    lineColor: row.lineColor,
    lineWidth: row.lineWidth,
    lineDashed: !!row.lineDashed,
  });
}

export async function PATCH(req: Request) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();

    const [existing] = await db
      .select({ id: userFootprintSettings.userId })
      .from(userFootprintSettings)
      .where(eq(userFootprintSettings.userId, auth.userId));

    if (existing) {
      await db
        .update(userFootprintSettings)
        .set({
          showPhotos: body.showPhotos ? 1 : 0,
          showLines: body.showLines ? 1 : 0,
          showLabels: body.showLabels ? 1 : 0,
          showPoiLabels: body.showPoiLabels ? 1 : 0,
          showTitle: body.showTitle ? 1 : 0,
          panelCollapsed: body.panelCollapsed ? 1 : 0,
          backgroundColor: body.backgroundColor ?? '#0f172a',
          lineColor: body.lineColor ?? '#a5b4fc',
          lineWidth: body.lineWidth ?? 2,
          lineDashed: body.lineDashed ? 1 : 0,
          poiLabelColor: body.poiLabelColor ?? '#000000',
          markerColor: body.markerColor ?? '#ef4444',
          markerShape: body.markerShape ?? 'pin',
        })
        .where(eq(userFootprintSettings.userId, auth.userId));
    } else {
      await db
        .insert(userFootprintSettings)
        .values({
          userId: auth.userId,
          showPhotos: body.showPhotos ? 1 : 0,
          showLines: body.showLines ? 1 : 0,
          showLabels: body.showLabels ? 1 : 0,
          showPoiLabels: body.showPoiLabels ? 1 : 0,
          showTitle: body.showTitle ? 1 : 0,
          panelCollapsed: body.panelCollapsed ? 1 : 0,
          backgroundColor: body.backgroundColor ?? '#0f172a',
          lineColor: body.lineColor ?? '#a5b4fc',
          lineWidth: body.lineWidth ?? 2,
          lineDashed: body.lineDashed ? 1 : 0,
          poiLabelColor: body.poiLabelColor ?? '#000000',
          markerColor: body.markerColor ?? '#ef4444',
          markerShape: body.markerShape ?? 'pin',
        });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('PATCH settings error:', err);
    return NextResponse.json({ error: '保存失败' }, { status: 500 });
  }
}
