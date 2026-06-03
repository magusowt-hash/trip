import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { footprintGroups, footprintGroupItems, listItems, localMapAssets, localMapRoots, mapPois, userMapFootprints } from '@/db/schema';
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeRootName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\\/g, '/');
}

function parseGroupId(value: unknown): number | null {
  const groupId = Number(value);
  return Number.isFinite(groupId) && groupId > 0 ? groupId : null;
}

async function getGroupFootprintItems(userId: number, groupId: number) {
  const [group] = await db
    .select({ id: footprintGroups.id })
    .from(footprintGroups)
    .where(and(eq(footprintGroups.id, groupId), eq(footprintGroups.userId, userId)))
    .limit(1);
  if (!group) return null;

  const listRows = await db
    .select({ id: footprintGroupItems.id, title: listItems.title })
    .from(footprintGroupItems)
    .innerJoin(listItems, eq(footprintGroupItems.listItemId, listItems.id))
    .where(eq(footprintGroupItems.groupId, groupId));
  const mapRows = await db
    .select({ id: userMapFootprints.id, title: mapPois.name })
    .from(userMapFootprints)
    .innerJoin(mapPois, eq(userMapFootprints.poiId, mapPois.id))
    .where(and(eq(userMapFootprints.userId, userId), eq(userMapFootprints.groupId, groupId)));

  return [
    ...listRows.map((row) => ({ id: row.id, title: row.title })),
    ...mapRows.map((row) => ({ id: row.id, title: row.title })),
  ];
}

async function listKnownRootsForScope(userId: number, groupId: number) {
  return db
    .select({ rootName: localMapRoots.rootName })
    .from(localMapRoots)
    .where(and(
      eq(localMapRoots.userId, userId),
      eq(localMapRoots.groupId, groupId),
    ));
}

async function findLocalMapRoot(userId: number, groupId: number, rootName: string) {
  const [root] = await db
    .select()
    .from(localMapRoots)
    .where(and(
      eq(localMapRoots.userId, userId),
      eq(localMapRoots.groupId, groupId),
      eq(localMapRoots.rootName, rootName),
    ))
    .limit(1);
  return root ?? null;
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
    const groupId = parseGroupId(searchParams.get('group_id'));
    if (!groupId) {
      return NextResponse.json({ error: '缺少足迹组' }, { status: 400 });
    }
    const groupFootprintItems = await getGroupFootprintItems(auth.userId, groupId);
    if (groupFootprintItems === null) {
      return NextResponse.json({ error: '足迹组不存在' }, { status: 404 });
    }
    const footprintItemIds = groupFootprintItems.map((item) => item.id);
    const titleByFootprintItemId = new Map(groupFootprintItems.map((item) => [item.id, item.title]));

    const knownRoots = await listKnownRootsForScope(auth.userId, groupId);

    if (!rootName) {
      return NextResponse.json({
        record: null,
        knownRootNames: knownRoots.map((item) => item.rootName),
      });
    }

    const root = await findLocalMapRoot(auth.userId, groupId, rootName);

    if (!root) {
      return NextResponse.json({
        record: null,
        knownRootNames: knownRoots.map((item) => item.rootName),
      });
    }

    if (footprintItemIds.length === 0) {
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
          matchedPlaceTitle: titleByFootprintItemId.get(asset.footprintItemId) ?? asset.folderName,
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
    const groupId = parseGroupId(body?.groupId);
    const unmatchedFolders = Array.isArray(body?.unmatchedFolders)
      ? body.unmatchedFolders.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const deletedRelativePaths = Array.isArray(body?.deletedRelativePaths)
      ? body.deletedRelativePaths.filter(isNonEmptyString).map((item) => item.trim())
      : [];
    const layout = parseLayout(body?.layout);

    if (!rootName) {
      return NextResponse.json({ error: '缺少主文件夹名称' }, { status: 400 });
    }
    if (!groupId) {
      return NextResponse.json({ error: '缺少足迹组' }, { status: 400 });
    }

    const groupFootprintItems = await getGroupFootprintItems(auth.userId, groupId);
    if (groupFootprintItems === null) {
      return NextResponse.json({ error: '足迹组不存在' }, { status: 404 });
    }
    const groupFootprintItemIds = groupFootprintItems.map((item) => item.id);
    const groupFootprintItemIdSet = new Set(groupFootprintItemIds);

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
          .filter((asset) => (
            asset.relativePath &&
            asset.name &&
            asset.footprintItemId > 0 &&
            groupFootprintItemIdSet.has(asset.footprintItemId)
          ))
      : [];

    const existingRoot = await findLocalMapRoot(auth.userId, groupId, rootName);

    const rootId = existingRoot
      ? existingRoot.id
      : (await db.insert(localMapRoots).values({
          userId: auth.userId,
          groupId,
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
    }

    if (deletedRelativePaths.length > 0) {
      await db
        .delete(localMapAssets)
        .where(and(
          eq(localMapAssets.userId, auth.userId),
          eq(localMapAssets.rootId, rootId),
          inArray(localMapAssets.relativePath, deletedRelativePaths),
          groupFootprintItemIds.length > 0
            ? inArray(localMapAssets.footprintItemId, groupFootprintItemIds)
            : eq(localMapAssets.footprintItemId, -1),
        ));
    }

    if (assets.length > 0) {
      const existingAssets = await db
        .select({
          id: localMapAssets.id,
          relativePath: localMapAssets.relativePath,
        })
        .from(localMapAssets)
        .where(and(
          eq(localMapAssets.userId, auth.userId),
          eq(localMapAssets.rootId, rootId),
          inArray(localMapAssets.relativePath, assets.map((asset) => asset.relativePath)),
        ));
      const existingByRelativePath = new Map(existingAssets.map((asset) => [asset.relativePath, asset.id]));

      const toInsert = assets.filter((asset) => !existingByRelativePath.has(asset.relativePath));
      const toUpdate = assets.filter((asset) => existingByRelativePath.has(asset.relativePath));

      if (toInsert.length > 0) {
        await db.insert(localMapAssets).values(
          toInsert.map((asset) => ({
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

      for (const asset of toUpdate) {
        await db
          .update(localMapAssets)
          .set({
            footprintItemId: asset.footprintItemId,
            folderName: asset.folderName,
            name: asset.name,
            size: asset.size,
            lastModified: asset.lastModified,
            frameX: asset.frameX,
            frameY: asset.frameY,
            pixelWidth: asset.pixelWidth ?? null,
            pixelHeight: asset.pixelHeight ?? null,
            updatedAt: new Date(),
          })
          .where(eq(localMapAssets.id, existingByRelativePath.get(asset.relativePath)!));
      }
    }

    const knownRoots = await listKnownRootsForScope(auth.userId, groupId);

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
