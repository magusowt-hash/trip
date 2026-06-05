import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { mapPackages as mapPackagesTable } from '@/db/schema';
import type { MapPackageRecord } from '../contracts/map-package';
import { buildMapPackageRuntimeList } from '../map-package-runtime';
import { mapPackages as registeredMapPackages } from '../registry/map-packages';

type MapPackageRow = typeof mapPackagesTable.$inferSelect;

function toRecord(row: MapPackageRow): MapPackageRecord {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    isEnabled: row.isEnabled,
    sortOrder: row.sortOrder,
  };
}

async function seedMissingMapPackages() {
  const existing = await db.select().from(mapPackagesTable);
  const existingSlugs = new Set(existing.map((item) => item.slug));
  const missing = registeredMapPackages
    .filter((item) => !existingSlugs.has(item.slug))
    .map((item, index) => ({
      slug: item.slug,
      name: item.name,
      description: item.description,
      isEnabled: 1,
      sortOrder: existing.length + index + 1,
    }));

  if (missing.length > 0) {
    await db.insert(mapPackagesTable).values(missing);
  }
}

export async function listStoredMapPackageRecords() {
  await seedMissingMapPackages();
  const rows = await db.select().from(mapPackagesTable).orderBy(asc(mapPackagesTable.sortOrder), asc(mapPackagesTable.id));
  return rows.map(toRecord);
}

export async function listAdminMapPackages() {
  const storedRecords = await listStoredMapPackageRecords();
  return buildMapPackageRuntimeList({
    registeredPackages: registeredMapPackages,
    storedRecords,
  }).adminPackages;
}

export async function listPublicMapPackages() {
  const storedRecords = await listStoredMapPackageRecords();
  return buildMapPackageRuntimeList({
    registeredPackages: registeredMapPackages,
    storedRecords,
  }).frontendPackages;
}

export async function updateMapPackageRecord(
  slug: string,
  updates: Partial<Pick<MapPackageRecord, 'name' | 'description' | 'sortOrder'>> & { isEnabled?: boolean },
) {
  await seedMissingMapPackages();

  const payload: Partial<typeof mapPackagesTable.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    payload.name = updates.name;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description;
  }
  if (updates.sortOrder !== undefined) {
    payload.sortOrder = updates.sortOrder;
  }
  if (updates.isEnabled !== undefined) {
    payload.isEnabled = updates.isEnabled ? 1 : 0;
  }

  await db.update(mapPackagesTable).set(payload).where(eq(mapPackagesTable.slug, slug));

  const rows = await db.select().from(mapPackagesTable).where(eq(mapPackagesTable.slug, slug)).limit(1);
  return rows[0] ? toRecord(rows[0]) : null;
}

