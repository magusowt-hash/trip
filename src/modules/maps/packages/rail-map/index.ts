import type { MapPackage } from '../../core/contracts/map-package';
import { RailMapAdminPage } from './admin';
import { RailMapRightPanel } from './frontend';

export const railMapPackage: MapPackage = {
  slug: 'rail',
  packageName: 'rail-map',
  name: '中国铁路地图',
  description: '站点显示参数、覆盖管理。',
  admin: {
    enabled: true,
    entryPath: '/management/maps/rail',
    page: RailMapAdminPage,
  },
  frontend: {
    rightPanel: RailMapRightPanel,
  },
};
