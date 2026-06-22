import type { PassportVisaRiskLevel } from './passportVisaAdminTypes.ts';

export type PassportVisaRiskMarkSpec = {
  kind: 'shield-check' | 'warning' | 'prohibited';
  color: string;
  title: PassportVisaRiskLevel;
};

export function getPassportVisaRiskMarkSpec(riskLevel: PassportVisaRiskLevel): PassportVisaRiskMarkSpec {
  if (riskLevel === '低风险') {
    return { kind: 'shield-check', color: '#1F9D55', title: '低风险' };
  }
  if (riskLevel === '中风险') {
    return { kind: 'warning', color: '#FFD400', title: '中风险' };
  }
  if (riskLevel === '高风险') {
    return { kind: 'warning', color: '#FF3B30', title: '高风险' };
  }
  return { kind: 'prohibited', color: '#C53E3E', title: '请勿前往' };
}
