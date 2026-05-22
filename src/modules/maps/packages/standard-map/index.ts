import type { MapPackage } from '../../core/contracts/map-package';
import { StandardMapAdminPage } from './admin';
import { StandardMapRightPanel } from './frontend';

export const standardMapPackage: MapPackage = {
  slug: 'standard',
  packageName: 'standard-map',
  name: '普通地图',
  description: '地点搜索、地图点击识别已有 POI、收藏与已去。',
  admin: {
    enabled: true,
    entryPath: '/management/maps/standard',
    page: StandardMapAdminPage,
  },
  frontend: {
    rightPanel: StandardMapRightPanel,
  },
};
