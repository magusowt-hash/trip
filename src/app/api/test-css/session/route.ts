import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

type PersistedImageRecord = {
  relativePath: string;
  folderName: string;
  name: string;
  size: number;
  lastModified: number;
  sortOrder: number;
};

type PersistedSession = {
  version: number;
  rootName: string;
  savedAt: string;
  files: PersistedImageRecord[];
};

const WORKSPACE_DIR = path.join(process.cwd(), 'test', 'test-css-workspace');
const SESSION_FILE = path.join(WORKSPACE_DIR, 'folder-preview-session.json');

async function ensureWorkspace() {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

async function readSession(): Promise<PersistedSession | null> {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    return JSON.parse(raw) as PersistedSession;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function GET() {
  try {
    const session = await readSession();
    return NextResponse.json({ session });
  } catch (error) {
    console.error('GET /api/test-css/session error:', error);
    return NextResponse.json({ error: '读取测试记录失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<PersistedSession>;
    const rootName = typeof body.rootName === 'string' ? body.rootName.trim() : '';
    const files = Array.isArray(body.files) ? body.files : [];

    if (!rootName) {
      return NextResponse.json({ error: '缺少根目录名称' }, { status: 400 });
    }

    const normalizedFiles = files
      .map((file, index) => ({
        relativePath: typeof file?.relativePath === 'string' ? file.relativePath : '',
        folderName: typeof file?.folderName === 'string' ? file.folderName : '根目录',
        name: typeof file?.name === 'string' ? file.name : '',
        size: Number(file?.size) || 0,
        lastModified: Number(file?.lastModified) || 0,
        sortOrder: Number.isFinite(Number(file?.sortOrder)) ? Number(file?.sortOrder) : index,
      }))
      .filter((file) => file.relativePath && file.name);

    const payload: PersistedSession = {
      version: 1,
      rootName,
      savedAt: new Date().toISOString(),
      files: normalizedFiles,
    };

    await ensureWorkspace();
    await fs.writeFile(SESSION_FILE, JSON.stringify(payload, null, 2), 'utf8');

    return NextResponse.json({ ok: true, session: payload });
  } catch (error) {
    console.error('POST /api/test-css/session error:', error);
    return NextResponse.json({ error: '保存测试记录失败' }, { status: 500 });
  }
}

