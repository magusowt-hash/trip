import fs from 'fs';
import path from 'path';
import { eq, and, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/db';
import { footprintGroupItems, storageFiles } from '@/db/schema';
import { buildFootprintPhotoScopeKey, parseFootprintPhotoScopeKey, parseMapFootprintPhotoScopeKey } from '@/lib/footprintPhotoScope';

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

function userDir(userId: number, scopeKey: string): string {
  const dir = path.resolve(UPLOAD_ROOT, `user_${userId}`, sanitize(scopeKey));
  // Path traversal guard
  if (!dir.startsWith(UPLOAD_ROOT + path.sep)) throw new Error('路径非法');
  return dir;
}

function ensureUniqueFilename(dir: string, preferredName: string): string {
  let finalName = sanitize(preferredName) || `file_${Date.now()}`;
  let counter = 1;
  while (fs.existsSync(path.join(dir, finalName))) {
    const ext = path.extname(preferredName);
    const base = path.basename(preferredName, ext);
    finalName = `${sanitize(base) || 'file'}_${counter}${ext}`;
    counter++;
  }
  return finalName;
}

function cleanupDirIfEmpty(dir: string) {
  if (!fs.existsSync(dir)) return;
  if (fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

export async function ensureScopedStorageForItem(
  userId: number,
  footprintItemId: number,
  legacyPlaceTitle: string,
) {
  if (!legacyPlaceTitle) return;

  const scopeKey = buildFootprintPhotoScopeKey(footprintItemId);
  const sanitizedScopeKey = sanitize(scopeKey);
  const sanitizedLegacyTitle = sanitize(legacyPlaceTitle);

  const [existingScoped] = await db
    .select({ id: storageFiles.id })
    .from(storageFiles)
    .where(and(
      eq(storageFiles.userId, userId),
      eq(storageFiles.placeTitle, sanitizedScopeKey),
    ))
    .limit(1);

  const targetItemIds = [footprintItemId].filter((value) => Number.isFinite(value));
  const allCandidateScopeKeys = [sanitizedLegacyTitle, sanitizedScopeKey];

  let seedScopeKey: string | null = null;
  let seedRows = await db
    .select()
    .from(storageFiles)
    .where(and(
      eq(storageFiles.userId, userId),
      eq(storageFiles.placeTitle, sanitizedLegacyTitle),
    ));

  if (seedRows.length > 0) {
    seedScopeKey = sanitizedLegacyTitle;
  } else {
    for (const candidateScopeKey of allCandidateScopeKeys) {
      const scopedRows = await db
        .select()
        .from(storageFiles)
        .where(and(
          eq(storageFiles.userId, userId),
          eq(storageFiles.placeTitle, candidateScopeKey),
        ))
        .limit(1);
      if (scopedRows.length > 0) {
        seedScopeKey = candidateScopeKey;
        seedRows = await db
          .select()
          .from(storageFiles)
          .where(and(
            eq(storageFiles.userId, userId),
            eq(storageFiles.placeTitle, candidateScopeKey),
          ));
        break;
      }
    }
  }

  if (seedRows.length === 0 || !seedScopeKey) return;
  if (existingScoped) return;

  const sourceDir = userDir(userId, seedScopeKey);
  let copiedSourceDir = sourceDir;
  const preparedRows = seedRows.map((row) => ({ ...row }));

  for (let index = 0; index < targetItemIds.length; index += 1) {
    const targetItemId = targetItemIds[index];
    const targetScopeKey = sanitize(buildFootprintPhotoScopeKey(targetItemId));
    const [targetExisting] = await db
      .select({ id: storageFiles.id })
      .from(storageFiles)
      .where(and(
        eq(storageFiles.userId, userId),
        eq(storageFiles.placeTitle, targetScopeKey),
      ))
      .limit(1);

    if (targetExisting) {
      copiedSourceDir = userDir(userId, targetScopeKey);
      continue;
    }

    const targetDir = userDir(userId, targetScopeKey);
    ensureDir(targetDir);

    if (index === 0 && seedScopeKey === sanitizedLegacyTitle) {
      for (const row of preparedRows) {
        const legacyFilePath = path.join(sourceDir, row.filename);
        const finalName = ensureUniqueFilename(targetDir, row.filename);
        const targetPath = path.join(targetDir, finalName);
        if (fs.existsSync(legacyFilePath)) {
          fs.renameSync(legacyFilePath, targetPath);
        }
        await db
          .update(storageFiles)
          .set({
            placeTitle: targetScopeKey,
            filename: finalName,
          })
          .where(eq(storageFiles.id, row.id));
        row.placeTitle = targetScopeKey;
        row.filename = finalName;
      }
      cleanupDirIfEmpty(sourceDir);
      copiedSourceDir = targetDir;
      continue;
    }

    for (const row of preparedRows) {
      const sourceFilePath = path.join(copiedSourceDir, row.filename);
      const finalName = ensureUniqueFilename(targetDir, row.filename);
      const targetPath = path.join(targetDir, finalName);
      if (fs.existsSync(sourceFilePath)) {
        fs.copyFileSync(sourceFilePath, targetPath);
      }
      await db.insert(storageFiles).values({
        userId,
        placeTitle: targetScopeKey,
        filename: finalName,
        size: row.size,
        frameX: row.frameX,
        frameY: row.frameY,
        createdAt: row.createdAt,
      });
    }
  }
}

export async function getAlbumScopeKeyForItem(
  userId: number,
  footprintItemId: number,
) {
  const [row] = await db
    .select({
      id: footprintGroupItems.id,
      albumScopeKey: footprintGroupItems.albumScopeKey,
    })
    .from(footprintGroupItems)
    .innerJoin(footprintGroups, eq(footprintGroupItems.groupId, footprintGroups.id))
    .where(and(
      eq(footprintGroupItems.id, footprintItemId),
      eq(footprintGroups.userId, userId),
    ))
    .limit(1);

  if (!row) return null;
  const nextScopeKey = row.albumScopeKey || buildFootprintPhotoScopeKey(row.id);

  if (!row.albumScopeKey) {
    await db
      .update(footprintGroupItems)
      .set({ albumScopeKey: nextScopeKey })
      .where(eq(footprintGroupItems.id, row.id));
  }

  return nextScopeKey;
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
  scopeKey: string,
  filename: string,
  buffer: Buffer,
  options?: { pixelWidth?: number; pixelHeight?: number },
): Promise<{ url: string; size: number; pixelWidth?: number; pixelHeight?: number }> {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) throw new Error(`不支持的文件类型: ${ext}`);
  if (buffer.length > MAX_FILE) throw new Error(`单个文件最大 ${MAX_FILE / 1024 / 1024}MB`);

  const usage = await getUserUsage(userId);
  if (usage + buffer.length > MAX_QUOTA) throw new Error('存储空间已满（5GB）');

  const dir = userDir(userId, scopeKey);
  ensureDir(dir);

  const safeName = sanitize(filename) || `file_${Date.now()}`;
  const finalName = ensureUniqueFilename(dir, safeName);

  fs.writeFileSync(path.join(dir, finalName), buffer);

  const stats = fs.statSync(path.join(dir, finalName));

  await db.insert(storageFiles).values({
    userId,
    placeTitle: sanitize(scopeKey),
    filename: finalName,
    size: stats.size,
    pixelWidth: options?.pixelWidth,
    pixelHeight: options?.pixelHeight,
  });

  return {
    url: `/api/storage/file?uid=${userId}&place=${encodeURIComponent(sanitize(scopeKey))}&file=${encodeURIComponent(finalName)}`,
    size: stats.size,
    pixelWidth: options?.pixelWidth,
    pixelHeight: options?.pixelHeight,
  };
}

export async function readImageMetadata(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      pixelWidth: metadata.width,
      pixelHeight: metadata.height,
    };
  } catch {
    return {
      pixelWidth: undefined,
      pixelHeight: undefined,
    };
  }
}

export async function listPhotos(userId: number, scopeKey: string) {
  const sanitizedScopeKey = sanitize(scopeKey);
  const footprintItemId = parseFootprintPhotoScopeKey(sanitizedScopeKey);
  const mapFootprintId = parseMapFootprintPhotoScopeKey(sanitizedScopeKey);
  const files = await db
    .select()
    .from(storageFiles)
    .where(and(eq(storageFiles.userId, userId), eq(storageFiles.placeTitle, sanitizedScopeKey)))
    .orderBy(storageFiles.createdAt);

  return files.map(f => {
    return {
      id: f.id,
      filename: f.filename,
      size: f.size,
      pixelWidth: f.pixelWidth ?? null,
      pixelHeight: f.pixelHeight ?? null,
      frameX: f.frameX ?? null,
      frameY: f.frameY ?? null,
      scopeKey: sanitizedScopeKey,
      footprintItemId,
      mapFootprintId,
      url: `/api/storage/file?uid=${userId}&place=${encodeURIComponent(sanitizedScopeKey)}&file=${encodeURIComponent(f.filename)}`,
      thumbnailUrl: null,
      createdAt: f.createdAt,
    };
  });
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
