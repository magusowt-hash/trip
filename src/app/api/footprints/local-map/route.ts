import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '../_auth';

type LocalMapAssetRecord = {
  relativePath: string;
  folderName: string;
  name: string;
  size: number;
  lastModified: number;
  matchedPlaceTitle: string;
  frameX: number | null;
  frameY: number | null;
  missing: boolean;
};

type LocalMapRootRecord = {
  rootName: string;
  savedAt: string;
  assets: LocalMapAssetRecord[];
  unmatchedFolders: string[];
};

type LocalMapStore = {
  version: number;
  roots: LocalMapRootRecord[];
};

const WORKSPACE_DIR = path.join(process.cwd(), 'test', 'footprint-local-map');
const STORE_FILE = path.join(WORKSPACE_DIR, 'local-map-store.json');

function normalizeRootName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\\/g, '/');
}

async function ensureWorkspace() {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

async function readStore(): Promise<LocalMapStore> {
  try {
    const raw = await fs.readFile(STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<LocalMapStore>;
    return {
      version: 1,
      roots: Array.isArray(parsed.roots) ? parsed.roots : [],
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return { version: 1, roots: [] };
    }
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const rootName = normalizeRootName(searchParams.get('rootName'));
    const store = await readStore();
    const record = rootName
      ? store.roots.find((item) => item.rootName === rootName) ?? null
      : null;

    return NextResponse.json({
      record,
      knownRootNames: store.roots.map((item) => item.rootName),
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
            frameX: typeof asset?.frameX === 'number' ? asset.frameX : null,
            frameY: typeof asset?.frameY === 'number' ? asset.frameY : null,
            missing: Boolean(asset?.missing),
          }))
          .filter((asset) => asset.relativePath && asset.name && asset.matchedPlaceTitle)
      : [];

    const record: LocalMapRootRecord = {
      rootName,
      savedAt: new Date().toISOString(),
      assets,
      unmatchedFolders,
    };

    const store = await readStore();
    const roots = store.roots.filter((item) => item.rootName !== rootName);
    roots.push(record);
    roots.sort((a, b) => a.rootName.localeCompare(b.rootName, 'zh-CN'));

    await ensureWorkspace();
    await fs.writeFile(STORE_FILE, JSON.stringify({ version: 1, roots }, null, 2), 'utf8');

    return NextResponse.json({
      ok: true,
      record,
      knownRootNames: roots.map((item) => item.rootName),
    });
  } catch (error) {
    console.error('POST /api/footprints/local-map error:', error);
    return NextResponse.json({ error: '保存本地映射记录失败' }, { status: 500 });
  }
}
