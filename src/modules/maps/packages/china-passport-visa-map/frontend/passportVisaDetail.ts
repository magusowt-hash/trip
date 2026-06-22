import type { PassportVisaCountry, PassportVisaRiskLevel } from '../data/passportVisaTypes.ts';

export type PassportVisaDetailSection = {
  title: string;
  content: string;
  emptyLabel: string;
};

export function getPassportVisaRiskBadgeTone(riskLevel: PassportVisaRiskLevel) {
  if (riskLevel === '低风险') return 'low';
  if (riskLevel === '中风险') return 'medium';
  if (riskLevel === '高风险') return 'high';
  return 'blocked';
}

export function shouldRenderPassportVisaRiskBadge(riskLevel: PassportVisaRiskLevel) {
  return riskLevel !== '低风险';
}

export function shouldRenderPassportVisaReligiousLawBadge(religiousLawRestrictions: string) {
  return religiousLawRestrictions.trim().length > 0;
}

export function getPassportVisaDetailSections(country: PassportVisaCountry): PassportVisaDetailSection[] {
  return [
    {
      title: '入境居留',
      content: country.entryResidence.trim(),
      emptyLabel: '暂无入境居留信息',
    },
    {
      title: '旅行风险等级和安全提醒',
      content: country.travelRiskSafety.trim(),
      emptyLabel: '暂无旅行风险等级和安全提醒',
    },
    {
      title: '安全防范',
      content: country.safetyPrecautions.trim(),
      emptyLabel: '暂无安全防范信息',
    },
    {
      title: '教法约束',
      content: country.religiousLawRestrictions.trim(),
      emptyLabel: '暂无教法约束信息',
    },
  ];
}
