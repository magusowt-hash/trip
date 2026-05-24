import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { localMapAssets, localMapRoots } from '@/db/schema';
import { authenticate } from '../_auth';

type LocalMapAssetRecord = {
  relativePath: string;
  folderName: string;
  name: string;
  size: number;
  lastModified: number;
  matchedPlaceTitle: string;
  footprintItemId: number;
  frameX: number | null;
  frameY: number | null;
  pixelWidth?: number | null;
  pixelHeight?: number | null;
  missing: boolean;
};

type LocalMapLayoutMode = 'grid' | 'staggered' | 'random';
type LocalMapStaggerAxis = 'horizontal' | 'vertical';

type LocalMapLayoutRecord = {
  mode: LocalMapLayoutMode;
  gapX: number;
  gapY: number;
  staggerAxis: LocalMapStaggerAxis;
};

function normalizeRootName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\\/g, '/');
}

function parseFootprintItemIds(searchParams: URLSearchParams): number[] {
  return searchParams
    .getAll('footprint_item_id')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function parseLayout(input: unknown): LocalMapLayoutRecord | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const mode = raw.mode;
  const gapX = Number(raw.gapX);
  const gapY = Number(raw.gapY);
  const staggerAxis = raw.staggerAxis;
  if (mode !== 'grid' && mode !== 'staggered' && mode !== 'random') return null;
  if (staggerAxis !== 'horizontal' && staggerAxis !== 'vertical') return null;
  return {
    mode,
    gapX: Number.isFinite(gapX) ? Math.max(0, Math.round(gapX)) : 0,
    gapY: Number.isFinite(gapY) ? Math.max(0, Math.round(gapY)) : 0,
    staggerAxis,
  };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const rootName = normalizeRootName(searchParams.get('rootName'));
    const footprintItemIds = parseFootprintItemIds(searchParams);

    const knownRoots = await db
      .select({ rootName: localMapRoots.rootName })
      .from(localMapRoots)
      .where(eq(localMapRoots.userId, auth.userId));

    if (!rootName) {
      return NextResponse.json({
        record: null,
        knownRootNames: knownRoots.map((item) => item.rootName),
      });
    }

    const [root] = await db
      .select()
      .from(localMapRoots)
      .where(and(
        eq(localMapRoots.userId, auth.userId),
        eq(localMapRoots.rootName, rootName),
      ))
      .limit(1);

    if (!root) {
      return NextResponse.json({
        record: null,
        knownRootNames: knownRoots.map((item) => item.rootName),
      });
    }

    const assetWhere = [
      eq(localMapAssets.userId, auth.userId),
      eq(localMapAssets.rootId, root.id),
    ];
    if (footprintItemIds.length > 0) {
      assetWhere.push(inArray(localMapAssets.footprintItemId, footprintItemIds));
    }

    const assets = await db
      .select()
      .from(localMapAssets)
      .where(and(...assetWhere));

    return NextResponse.json({
      record: {
        rootName: root.rootName,
        savedAt: root.updatedAt,
        layout: root.layoutMode ? {
          mode: root.layoutMode as LocalMapLayoutMode,
          gapX: root.layoutGapX ?? 0,
          gapY: root.layoutGapY ?? 0,
          staggerAxis: (root.layoutStaggerAxis as LocalMapStaggerAxis) || 'horizontal',
        } : null,
        assets: assets.map((asset) => ({
          relativePath: asset.relativePath,
          folderName: asset.folderName,
          name: asset.name,
          size: asset.size,
          lastModified: asset.lastModified,
          matchedPlaceTitle: '',
          footprintItemId: asset.footprintItemId,
          frameX: asset.frameX,
          frameY: asset.frameY,
          pixelWidth: asset.pixelWidth,
          pixelHeight: asset.pixelHeight,
          missing: false,
        })),
        unmatchedFolders: [],
      },
      knownRootNames: knownRoots.map((item) => item.rootName),
    });
  } catch (error) {
    console.error('GET /api/footprints/local-map error:', error);
    return NextResponse.json({ error: '读取本地映射记录失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const rootName = normalizeRootName(body?.rootName);
    const unmatchedFolders = Array.isArray(body?.unmatchedFolders)
      ? body.unmatchedFolders.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const layout = parseLayout(body?.layout);

    if (!rootName) {
      return NextResponse.json({ error: '缺少主文件夹名称' }, { status: 400 });
    }

    const assets: LocalMapAssetRecord[] = Array.isArray(body?.assets)
      ? body.assets
          .map((asset: any) => ({
            relativePath: typeof asset?.relativePath === 'string' ? asset.relativePath : '',
            folderName: typeof asset?.folderName === 'string' ? asset.folderName : '',
            name: typeof asset?.name === 'string' ? asset.name : '',
            size: Number(asset?.size) || 0,
            lastModified: Number(asset?.lastModified) || 0,
            matchedPlaceTitle: typeof asset?.matchedPlaceTitle === 'string' ? asset.matchedPlaceTitle : '',
            footprintItemId: Number(asset?.footprintItemId) || 0,
            frameX: typeof asset?.frameX === 'number' ? asset.frameX : null,
            frameY: typeof asset?.frameY === 'number' ? asset.frameY : null,
            pixelWidth: typeof asset?.pixelWidth === 'number' ? asset.pixelWidth : null,
            pixelHeight: typeof asset?.pixelHeight === 'number' ? asset.pixelHeight : null,
            missing: Boolean(asset?.missing),
          }))
          .filter((asset) => asset.relativePath && asset.name && asset.footprintItemId > 0)
      : [];

    const [existingRoot] = await db
      .select()
      .from(localMapRoots)
      .where(and(
        eq(localMapRoots.userId, auth.userId),
        eq(localMapRoots.rootName, rootName),
      ))
      .limit(1);

    const rootId = existingRoot
      ? existingRoot.id
      : (await db.insert(localMapRoots).values({
          userId: auth.userId,
          rootName,
          layoutMode: layout?.mode ?? null,
          layoutGapX: layout?.gapX ?? null,
          layoutGapY: layout?.gapY ?? null,
          layoutStaggerAxis: layout?.staggerAxis ?? null,
        }))[0].insertId;

    if (existingRoot) {
      await db
        .update(localMapRoots)
        .set({
          updatedAt: new Date(),
          layoutMode: layout?.mode ?? null,
          layoutGapX: layout?.gapX ?? null,
          layoutGapY: layout?.gapY ?? null,
          layoutStaggerAxis: layout?.staggerAxis ?? null,
        })
        .where(eq(localMapRoots.id, rootId));

      await db
        .delete(localMapAssets)
        .where(and(
          eq(localMapAssets.userId, auth.userId),
          eq(localMapAssets.rootId, rootId),
        ));
    }

    if (assets.length > 0) {
      await db.insert(localMapAssets).values(
        assets.map((asset) => ({
          userId: auth.userId,
          rootId,
          footprintItemId: asset.footprintItemId,
          relativePath: asset.relativePath,
          folderName: asset.folderName,
          name: asset.name,
          size: asset.size,
          lastModified: asset.lastModified,
          frameX: asset.frameX,
          frameY: asset.frameY,
          pixelWidth: asset.pixelWidth ?? null,
          pixelHeight: asset.pixelHeight ?? null,
        })),
      );
    }

    const knownRoots = await db
      .select({ rootName: localMapRoots.rootName })
      .from(localMapRoots)
      .where(eq(localMapRoots.userId, auth.userId));

    return NextResponse.json({
      ok: true,
      record: {
        rootName,
        savedAt: new Date().toISOString(),
        layout,
        assets,
        unmatchedFolders,
      },
      knownRootNames: knownRoots.map((item) => item.rootName),
    });
  } catch (error) {
    console.error('POST /api/footprints/local-map error:', error);
    return NextResponse.json({ error: '保存本地映射记录失败' }, { status: 500 });
  }
}
