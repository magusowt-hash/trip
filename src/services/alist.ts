interface AlistFile {
  name: string;
  size: number;
  is_dir: boolean;
  modified: string;
  sign: string;
  thumb: string;
  type: number;
}

let cachedConfig: { url: string; username: string; password: string; rootPath: string; enabled: boolean } | null = null;
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getConfig() {
  if (cachedConfig) return cachedConfig;
  try {
    const { db } = await import('@/db');
    const { alistConfig } = await import('@/db/schema');
    const row = (await db.select().from(alistConfig).limit(1))[0];
    if (!row || !row.enabled) return null;
    cachedConfig = {
      url: (row.url as string).replace(/\/$/, ''),
      username: row.username as string,
      password: row.password as string,
      rootPath: (row.rootPath as string) || '/',
      enabled: true,
    };
    return cachedConfig;
  } catch {
    return null;
  }
}

async function getToken(config: { url: string; username: string; password: string }): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${config.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const data = await res.json() as any;
  if (data.code !== 200) throw new Error('AList login failed: ' + (data.message || ''));
  cachedToken = data.data.token;
  tokenExpiry = Date.now() + 3600000;
  return cachedToken;
}

async function alistFetch(config: { url: string }, path: string, body?: any): Promise<any> {
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

export async function searchFolders(userId: number, name: string) {
  const config = await getConfig();
  if (!config) return [];
  const userPath = buildUserPath(config, userId, '');
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(userPath)}&password=`);
  if ((data as any).code !== 200 || !(data as any).data?.content) return [];
  return ((data as any).data.content as AlistFile[])
    .filter(f => f.is_dir && f.name.includes(name))
    .map(f => ({ name: f.name, path: userPath + f.name, file_count: 0 }));
}

export async function listFiles(userId: number, subPath: string) {
  const config = await getConfig();
  if (!config) return [];
  const fullPath = buildUserPath(config, userId, subPath);
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(fullPath)}&password=`);
  if ((data as any).code !== 200 || !(data as any).data?.content) return [];
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  return ((data as any).data.content as AlistFile[])
    .filter(f => !f.is_dir && imageExts.some(ext => f.name.toLowerCase().endsWith(ext)))
    .map(f => ({
      name: f.name,
      url: f.sign ? `${config.url}/d${fullPath}/${f.name}?sign=${f.sign}` : '',
      thumb: f.thumb ? `${config.url}/d${fullPath}/${f.name}?sign=${f.thumb}` : '',
      size: f.size,
    }));
}

export async function getFirstImage(userId: number, subPath: string): Promise<string | null> {
  const config = await getConfig();
  if (!config) return null;
  const fullPath = buildUserPath(config, userId, subPath);
  const data = await alistFetch(config, `/fs/list?path=${encodeURIComponent(fullPath)}&password=`);
  if ((data as any).code !== 200 || !(data as any).data?.content) return null;
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const first = ((data as any).data.content as AlistFile[]).find(
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
