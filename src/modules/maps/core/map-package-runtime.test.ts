import test from 'node:test';
import assert from 'node:assert/strict';

import type { MapPackage, MapPackageRecord } from './contracts/map-package';
import {
  buildMapPackageRuntimeList,
  pickInitialActiveMapSlug,
} from './map-package-runtime';

const registeredPackages: MapPackage[] = [
  {
    slug: 'standard',
    packageName: 'standard-map',
    name: '普通地图',
    description: '地点搜索、地图点击识别已有 POI、收藏与已去。',
    admin: {
      enabled: true,
      entryPath: '/management/maps/standard',
      page: (() => null) as any,
    },
    frontend: {
      rightPanel: (() => null) as any,
    },
  },
  {
    slug: 'rail',
    packageName: 'rail-map',
    name: '中国铁路地图',
    description: '站点显示参数、覆盖管理。',
    admin: {
      enabled: true,
      entryPath: '/management/maps/rail',
      page: (() => null) as any,
    },
    frontend: {
      rightPanel: (() => null) as any,
    },
  },
];

const storedRecords: MapPackageRecord[] = [
  {
    slug: 'rail',
    name: '中国铁路地图',
    description: '站点显示参数、覆盖管理。',
    isEnabled: 1,
    sortOrder: 2,
  },
  {
    slug: 'standard',
    name: '普通地图',
    description: '地点搜索、地图点击识别已有 POI、收藏与已去。',
    isEnabled: 0,
    sortOrder: 1,
  },
  {
    slug: 'ghost',
    name: '未接入地图',
    description: '数据库里有但代码未注册。',
    isEnabled: 1,
    sortOrder: 3,
  },
];

test('buildMapPackageRuntimeList keeps admin entries while exposing only enabled registered frontend packages', () => {
  const runtime = buildMapPackageRuntimeList({
    registeredPackages,
    storedRecords,
  });

  assert.deepEqual(
    runtime.adminPackages.map((item) => ({
      slug: item.slug,
      isEnabled: item.isEnabled,
      hasFrontend: item.hasFrontend,
      hasAdmin: item.hasAdmin,
    })),
    [
      { slug: 'standard', isEnabled: false, hasFrontend: true, hasAdmin: true },
      { slug: 'rail', isEnabled: true, hasFrontend: true, hasAdmin: true },
      { slug: 'ghost', isEnabled: true, hasFrontend: false, hasAdmin: false },
    ],
  );

  assert.deepEqual(
    runtime.frontendPackages.map((item) => item.slug),
    ['rail'],
  );
});

test('pickInitialActiveMapSlug chooses the first enabled frontend package', () => {
  const runtime = buildMapPackageRuntimeList({
    registeredPackages,
    storedRecords,
  });

  assert.equal(pickInitialActiveMapSlug(runtime.frontendPackages), 'rail');
});

test('buildMapPackageRuntimeList falls back to registered defaults when storage is missing a package', () => {
  const runtime = buildMapPackageRuntimeList({
    registeredPackages,
    storedRecords: storedRecords.filter((item) => item.slug !== 'standard'),
  });

  const standard = runtime.adminPackages.find((item) => item.slug === 'standard');
  assert.ok(standard);
  assert.equal(standard.isEnabled, true);
  assert.equal(standard.name, '普通地图');

  assert.deepEqual(
    runtime.frontendPackages.map((item) => item.slug),
    ['standard', 'rail'],
  );
});

