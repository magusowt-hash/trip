import fs from 'fs';
import path from 'path';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db';
import { storageFiles } from '@/db/schema';

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const MAX_QUOTA = 5 * 1024 * 1024 * 1024; // 5GB
const MAX_FILE = 20 * 1024 * 1024; // 20MB per file
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}

function userDir(userId: number, placeTitle: string): string {
  const dir = path.resolve(UPLOAD_ROOT, `user_${userId}`, sanitize(placeTitle));
  // Path traversal guard
  if (!dir.startsWith(UPLOAD_ROOT + path.sep)) throw new Error('路径非法');
  return dir;
}

export async function getUserUsage(userId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${storageFiles.size}), 0)` })
    .from(storageFiles)
    .where(eq(storageFiles.userId, userId));
  return Number(row?.total) || 0;
}

export async function saveFile(
  userId: number,
  placeTitle: string,
  filename: string,
  buffer: Buffer,
): Promise<{ url: string; size: number }> {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new Error(`不支持的文件类型: ${ext}`);
  if (buffer.length > MAX_FILE) throw new Error(`单个文件最大 ${MAX_FILE / 1024 / 1024}MB`);

  const usage = await getUserUsage(userId);
  if (usage + buffer.length > MAX_QUOTA) throw new Error('存储空间已满（5GB）');

  const dir = userDir(userId, placeTitle);
  ensureDir(dir);

  const safeName = sanitize(filename) || `file_${Date.now()}`;
  const filePath = path.join(dir, safeName);

  // Avoid overwrite
  let finalName = safeName;
  let counter = 1;
  while (fs.existsSync(path.join(dir, finalName))) {
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    finalName = `${base}_${counter}${ext}`;
    counter++;
  }

  fs.writeFileSync(path.join(dir, finalName), buffer);

  const stats = fs.statSync(path.join(dir, finalName));

  await db.insert(storageFiles).values({
    userId,
    placeTitle: sanitize(placeTitle),
    filename: finalName,
    size: stats.size,
  });

  return {
    url: `/api/storage/file?uid=${userId}&place=${encodeURIComponent(sanitize(placeTitle))}&file=${encodeURIComponent(finalName)}`,
    size: stats.size,
  };
}

export async function listPhotos(userId: number, placeTitle: string) {
  const files = await db
    .select()
    .from(storageFiles)
    .where(and(eq(storageFiles.userId, userId), eq(storageFiles.placeTitle, sanitize(placeTitle))))
    .orderBy(storageFiles.createdAt);

  return files.map(f => ({
    id: f.id,
    filename: f.filename,
    size: f.size,
    frameX: f.frameX ?? null,
    frameY: f.frameY ?? null,
    url: `/api/storage/file?uid=${userId}&place=${encodeURIComponent(sanitize(placeTitle))}&file=${encodeURIComponent(f.filename)}`,
    createdAt: f.createdAt,
  }));
}

export async function deletePhoto(userId: number, fileId: number) {
  const [f] = await db.select().from(storageFiles).where(and(eq(storageFiles.id, fileId), eq(storageFiles.userId, userId)));
  if (!f) throw new Error('文件不存在');

  const filePath = path.join(userDir(userId, f.placeTitle), f.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await db.delete(storageFiles).where(eq(storageFiles.id, fileId));
}

export async function updatePhotoPosition(
  userId: number,
  fileId: number,
  frameX: number | null,
  frameY: number | null,
) {
  const [f] = await db.select({ id: storageFiles.id }).from(storageFiles)
    .where(and(eq(storageFiles.id, fileId), eq(storageFiles.userId, userId)));
  if (!f) throw new Error('文件不存在');

  await db.update(storageFiles)
    .set({ frameX, frameY })
    .where(eq(storageFiles.id, fileId));
}

export async function batchUpdatePhotoPositions(
  userId: number,
  updates: Array<{ id: number; frameX: number; frameY: number }>,
) {
  for (const u of updates) {
    await db.update(storageFiles)
      .set({ frameX: u.frameX, frameY: u.frameY })
      .where(and(eq(storageFiles.id, u.id), eq(storageFiles.userId, userId)));
  }
}

export function serveFile(uid: string, place: string, file: string): { buffer: Buffer; type: string } | null {
  const userId = parseInt(uid);
  if (!Number.isFinite(userId)) return null;

  const safePlace = sanitize(place);
  const safeFile = sanitize(file);
  const filePath = path.join(userDir(userId, safePlace), safeFile);

  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(safeFile).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  };

  return {
    buffer: fs.readFileSync(filePath),
    type: mimeMap[ext] || 'application/octet-stream',
  };
}
