import type { MapPackage, MapPackageRecord } from './contracts/map-package.ts';

export type MapPackageRuntimeItem = MapPackageRecord & {
  packageName: string | null;
  entryPath: string | null;
  hasFrontend: boolean;
  hasAdmin: boolean;
};

export function buildMapPackageRuntimeList(input: {
  registeredPackages: MapPackage[];
  storedRecords: MapPackageRecord[];
}) {
  const packageBySlug = new Map(input.registeredPackages.map((item) => [item.slug, item]));
  const runtimeMap = new Map<string, MapPackageRuntimeItem>();

  for (const item of input.storedRecords) {
    const registered = packageBySlug.get(item.slug);
    runtimeMap.set(item.slug, {
      ...item,
      isEnabled: item.isEnabled === true || item.isEnabled === 1,
      packageName: registered?.packageName ?? null,
      entryPath: registered?.admin.entryPath ?? null,
      hasFrontend: Boolean(registered?.frontend?.page || registered?.frontend?.rightPanel),
      hasAdmin: Boolean(registered?.admin?.page),
    });
  }

  for (const registered of input.registeredPackages) {
    if (runtimeMap.has(registered.slug)) {
      continue;
    }

    runtimeMap.set(registered.slug, {
      slug: registered.slug,
      name: registered.name,
      description: registered.description,
      isEnabled: true,
      sortOrder: 0,
      packageName: registered.packageName,
      entryPath: registered.admin.entryPath,
      hasFrontend: Boolean(registered.frontend?.page || registered.frontend?.rightPanel),
      hasAdmin: Boolean(registered.admin?.page),
    });
  }

  const sorted = [...runtimeMap.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.slug.localeCompare(b.slug, 'zh-CN');
  });

  return {
    adminPackages: sorted,
    frontendPackages: sorted.filter((item) => item.isEnabled && item.hasFrontend),
  };
}

export function pickInitialActiveMapSlug(packages: Array<{ slug: string }>) {
  return packages[0]?.slug ?? null;
}
