import type { SVGProps } from 'react';

import type { PassportVisaRiskLevel } from './passportVisaAdminTypes';
import { getPassportVisaRiskMarkSpec } from './passportVisaRiskMark.ts';

type PassportVisaRiskMarkProps = SVGProps<SVGSVGElement> & {
  riskLevel: PassportVisaRiskLevel;
};

export function PassportVisaRiskMark({ riskLevel, ...props }: PassportVisaRiskMarkProps) {
  const spec = getPassportVisaRiskMarkSpec(riskLevel);

  if (spec.kind === 'shield-check') {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
        <path d="M24 4L38 9V21C38 31.5 31.3 40.4 24 44C16.7 40.4 10 31.5 10 21V9L24 4Z" fill={spec.color} />
        <path d="M17.5 24.5L22 29L31 19.5" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (spec.kind === 'warning') {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
        <path d="M24 7L42 39H6L24 7Z" fill={spec.color} />
        <path d="M24 18V27" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
        <circle cx="24" cy="33" r="2.5" fill="#FFFFFF" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <g transform="translate(2.4 2.4) scale(0.9)">
        <circle cx="24" cy="24" r="17" stroke={spec.color} strokeWidth="6" />
        <path d="M14 34L34 14" stroke={spec.color} strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
