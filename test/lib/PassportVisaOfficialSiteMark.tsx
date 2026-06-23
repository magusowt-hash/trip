import type { SVGProps } from 'react';

type PassportVisaOfficialSiteMarkProps = SVGProps<SVGSVGElement> & {
  accentColor: string;
};

export function PassportVisaOfficialSiteMark({
  accentColor,
  ...props
}: PassportVisaOfficialSiteMarkProps) {
  return (
    <svg viewBox="0 0 128 128" fill="none" aria-hidden="true" {...props}>
      <path
        d="M40 39L64 26C69.8 22.9 75.5 27.5 75.5 33.5V38"
        stroke={accentColor}
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="30"
        y="39"
        width="54"
        height="68"
        rx="11"
        stroke={accentColor}
        strokeWidth="4.6"
      />
      <circle cx="57" cy="60" r="11" stroke={accentColor} strokeWidth="4" />
      <path d="M46 60H68" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M57 49V71" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path
        d="M49.8 49.6C52.2 52.4 53.6 56 53.6 60C53.6 64 52.2 67.6 49.8 70.4"
        stroke={accentColor}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M64.2 49.6C61.8 52.4 60.4 56 60.4 60C60.4 64 61.8 67.6 64.2 70.4"
        stroke={accentColor}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path d="M46.5 79H67.5" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M50 86.5H64" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
