import type { MapPackage } from '../../core/contracts/map-package';
import { ChinaNatureMapAdminPage } from './admin';
import { ChinaNatureMapRightPanel } from './frontend';

export const chinaNatureMapPackage: MapPackage = {
  slug: 'china-nature',
  packageName: 'china-nature-map',
  name: '中国自然地图',
  description: '自然专题入口与主题切换地图。',
  admin: {
    enabled: true,
    entryPath: '/management/maps/china-nature',
    page: ChinaNatureMapAdminPage,
  },
  frontend: {
    rightPanel: ChinaNatureMapRightPanel,
  },
};

