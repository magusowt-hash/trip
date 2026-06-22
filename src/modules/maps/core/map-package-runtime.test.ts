import test from 'node:test';
import assert from 'node:assert/strict';

import type { MapPackage, MapPackageRecord } from './contracts/map-package.ts';
import {
  buildMapPackageRuntimeList,
  pickInitialActiveMapSlug,
} from './map-package-runtime.ts';

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
  {
    slug: 'passport-visa',
    packageName: 'china-passport-visa-map',
    name: '中国护照签证地图',
    description: '中国护照全球签证便利度、场景筛选与后台编辑。',
    admin: {
      enabled: true,
      entryPath: '/management/maps/passport-visa',
      page: (() => null) as any,
    },
    frontend: {
      page: (() => null) as any,
    },
  },
  {
    slug: 'china-nature',
    packageName: 'china-nature-map',
    name: '中国自然地图',
    description: '自然主题图层、专题浏览与管理。',
    admin: {
      enabled: true,
      entryPath: '/management/maps/china-nature',
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
    slug: 'passport-visa',
    name: '中国护照签证地图',
    description: '中国护照全球签证便利度、场景筛选与后台编辑。',
    isEnabled: 1,
    sortOrder: 3,
  },
  {
    slug: 'ghost',
    name: '未接入地图',
    description: '数据库里有但代码未注册。',
    isEnabled: 1,
    sortOrder: 4,
  },
  {
    slug: 'china-nature',
    name: '中国自然地图',
    description: '自然主题图层、专题浏览与管理。',
    isEnabled: 1,
    sortOrder: 5,
  },
];

test('buildMapPackageRuntimeList keeps admin entries while exposing only enabled registered frontend packages', () => {
  const runtime = buildMapPackageRuntimeList({
    registeredPackages,
    storedRecords,
  });

  assert.ok(
    runtime.adminPackages.some((item) => item.slug === 'china-nature'),
  );

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
      { slug: 'passport-visa', isEnabled: true, hasFrontend: true, hasAdmin: true },
      { slug: 'ghost', isEnabled: true, hasFrontend: false, hasAdmin: false },
      {
        slug: 'china-nature',
        isEnabled: true,
        hasFrontend: true,
        hasAdmin: true,
      },
    ],
  );

  assert.deepEqual(
    runtime.frontendPackages.map((item) => item.slug),
    ['rail', 'passport-visa', 'china-nature'],
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
    ['standard', 'rail', 'passport-visa', 'china-nature'],
  );
});
