import type { PassportVisaLegendItem } from './passportVisaTypes.ts';

export const passportVisaLegend: PassportVisaLegendItem[] = [
  { group: 'region-neutral', label: '本地区', color: '#e5e7eb' },
  { group: 'visa-free', label: '免签', color: '#2f7d4b' },
  { group: 'visa-on-arrival', label: '落地签', color: '#4c8bf5' },
  { group: 'e-visa', label: '电子签/ETA', color: '#7b61ff' },
  { group: 'conditional-entry', label: '有条件免签/需第三方签证', color: '#f59e0b' },
  { group: 'visa-required', label: '需提前签证', color: '#d9485f' },
  { group: 'special-restriction', label: '特殊限制', color: '#6b7280' },
];
