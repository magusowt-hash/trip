import type { MapPackage } from '../../core/contracts/map-package';
import { ChinaPassportVisaMapAdminPage } from './admin';
import { ChinaPassportVisaMapRightPanel, PassportVisaPage } from './frontend';

export const chinaPassportVisaMapPackage: MapPackage = {
  slug: 'passport-visa',
  packageName: 'china-passport-visa-map',
  name: '中国护照签证地图',
  description: '中国普通护照全球签证便利度与国家详情。',
  admin: {
    enabled: true,
    entryPath: '/management/maps/passport-visa',
    page: ChinaPassportVisaMapAdminPage,
  },
  frontend: {
    page: PassportVisaPage,
    rightPanel: ChinaPassportVisaMapRightPanel,
  },
};
