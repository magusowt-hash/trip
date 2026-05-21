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

type SessionStore = {
  version: number;
  sessions: PersistedSession[];
};

const WORKSPACE_DIR = path.join(process.cwd(), 'test', 'test-css-workspace');
const SESSION_FILE = path.join(WORKSPACE_DIR, 'folder-preview-session.json');

async function ensureWorkspace() {
  await fs.mkdir(WORKSPACE_DIR, { recursive: true });
}

async function readStore(): Promise<SessionStore> {
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SessionStore>;
    return {
      version: 1,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return {
        version: 1,
        sessions: [],
      };
    }
    throw error;
  }
}

function normalizeRootName(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/\\/g, '/');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rootName = normalizeRootName(searchParams.get('rootName'));
    const store = await readStore();
    const session = rootName
      ? store.sessions.find((item) => item.rootName === rootName) ?? null
      : null;

    return NextResponse.json({
      session,
      knownRootNames: store.sessions.map((item) => item.rootName),
    });
  } catch (error) {
    console.error('GET /api/test-css/session error:', error);
    return NextResponse.json({ error: '读取测试记录失败' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<PersistedSession>;
    const rootName = normalizeRootName(body.rootName);
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

    const store = await readStore();
    const nextSessions = store.sessions.filter((item) => item.rootName !== rootName);
    nextSessions.push(payload);
    nextSessions.sort((a, b) => a.rootName.localeCompare(b.rootName, 'zh-CN'));

    await ensureWorkspace();
    await fs.writeFile(
      SESSION_FILE,
      JSON.stringify({ version: 1, sessions: nextSessions }, null, 2),
      'utf8',
    );

    return NextResponse.json({
      ok: true,
      session: payload,
      knownRootNames: nextSessions.map((item) => item.rootName),
    });
  } catch (error) {
    console.error('POST /api/test-css/session error:', error);
    return NextResponse.json({ error: '保存测试记录失败' }, { status: 500 });
  }
}
