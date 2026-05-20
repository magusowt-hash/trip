interface AlistFile {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  sign: string;
  thumb: string;
  type: number;
}

export interface AlistFolderSummary {
  name: string;
  path: string;
  file_count: number;
}

export interface AlistImageFile {
  name: string;
  url: string;
  thumb: string;
  size: number;
  path: string;
}

let cachedConfig: { url: string; username: string; password: string; rootPath: string; enabled: boolean } | null = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

type Config = { url: string; username: string; password: string; rootPath: string; enabled: boolean };

async function getConfig(): Promise<Config | null> {
  if (cachedConfig) return cachedConfig;
  try {
    const { db } = await import('@/db');
    const { alistConfig } = await import('@/db/schema');
    const row = (await db.select().from(alistConfig).limit(1))[0];
    if (!row || !row.enabled) return null;
    cachedConfig = {
      url: (row.url as string).replace(/\/$/, ''),
      username: (row.username as string) || '',
      password: (row.password as string) || '',
      rootPath: (row.rootPath as string) || '/',
      enabled: true,
    };
    return cachedConfig;
  } catch {
    return null;
  }
}

async function getToken(config: Config): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${config.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const data = await res.json() as any;
  if (data.code !== 200) throw new Error('AList login failed: ' + (data.message || ''));
  cachedToken = data.data.token as string;
  tokenExpiry = Date.now() + 3600000;
  return cachedToken!;
}

async function alistFetch(config: Config, path: string, body?: any): Promise<any> {
  const token = await getToken(config);
  const res = await fetch(`${config.url}/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function buildUserPath(config: { rootPath: string } | null, userId: number, subPath: string): string {
  const safe = subPath.replace(/\.\./g, '').replace(/^\/+/, '');
  const base = config?.rootPath || '/';
  const root = base.endsWith('/') ? base : base + '/';
  return `${root}user_${userId}/${safe}`.replace(/\/+/g, '/');
}

function normalizePath(input: string): string {
  if (!input) return '/';
  return input.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

async function listPath(config: Config, fullPath: string) {
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(normalizePath(fullPath))}&password=`);
  if ((data as any).code !== 200 || !(data as any).data?.content) return [];
  return (data as any).data.content as AlistFile[];
}

export async function searchFolders(userId: number, name: string) {
  const config = await getConfig();
  if (!config) return [];
  const userPath = buildUserPath(config, userId, '');
  return (await listPath(config, userPath))
    .filter(f => f.is_dir && f.name.includes(name))
    .map(f => ({ name: f.name, path: userPath + f.name, file_count: 0 }));
}

export async function listFiles(userId: number, subPath: string) {
  const config = await getConfig();
  if (!config) return [];
  const fullPath = buildUserPath(config, userId, subPath);
  const data = await listPath(config, fullPath);
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  return data
    .filter(f => !f.is_dir && imageExts.some(ext => f.name.toLowerCase().endsWith(ext)))
    .map(f => ({
      name: f.name,
      url: f.sign ? `${config.url}/d${fullPath}/${f.name}?sign=${f.sign}` : '',
      thumb: f.thumb ? `${config.url}/d${fullPath}/${f.name}?sign=${f.thumb}` : '',
      size: f.size,
    }));
}

export async function listRootFolders(userId: number): Promise<AlistFolderSummary[]> {
  const config = await getConfig();
  if (!config) return [];
  const userPath = buildUserPath(config, userId, '');
  return (await listPath(config, userPath))
    .filter(f => f.is_dir)
    .map(f => ({
      name: f.name,
      path: normalizePath(`${userPath}/${f.name}`),
      file_count: 0,
    }));
}

export async function listFilesByFullPath(fullPath: string): Promise<AlistImageFile[]> {
  const config = await getConfig();
  if (!config) return [];
  const normalized = normalizePath(fullPath);
  const data = await listPath(config, normalized);
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  return data
    .filter(f => !f.is_dir && imageExts.some(ext => f.name.toLowerCase().endsWith(ext)))
    .map(f => ({
      name: f.name,
      url: f.sign ? `${config.url}/d${normalized}/${f.name}?sign=${f.sign}` : '',
      thumb: f.thumb ? `${config.url}/d${normalized}/${f.name}?sign=${f.thumb}` : '',
      size: f.size,
      path: `${normalized}/${f.name}`.replace(/\/+/g, '/'),
    }));
}

export async function getFirstImage(userId: number, subPath: string): Promise<string | null> {
  const config = await getConfig();
  if (!config) return null;
  const fullPath = buildUserPath(config, userId, subPath);
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const first = (await listPath(config, fullPath)).find(
    f => !f.is_dir && imageExts.some(ext => f.name.toLowerCase().endsWith(ext)),
  );
  if (!first || !first.sign) return null;
  return `${config.url}/d${fullPath}/${first.name}?sign=${first.sign}`;
}

export async function testConnection(): Promise<boolean> {
  cachedConfig = null;
  cachedToken = null;
  const config = await getConfig();
  if (!config) return false;
  try { await getToken(config); return true; } catch { return false; }
}

export function clearCache() {
  cachedConfig = null;
  cachedToken = null;
  tokenExpiry = 0;
}
