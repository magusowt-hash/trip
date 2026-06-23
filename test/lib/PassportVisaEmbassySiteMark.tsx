import type { SVGProps } from 'react';

type PassportVisaEmbassySiteMarkProps = SVGProps<SVGSVGElement> & {
  accentColor: string;
};

export function PassportVisaEmbassySiteMark({
  accentColor,
  ...props
}: PassportVisaEmbassySiteMarkProps) {
  return (
    <svg viewBox="0 0 128 128" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20 100H108"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        d="M24 100V58H48L64 40L80 58H104V100"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M50 58H78V72H50V58Z"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinejoin="round"
      />
      <path
        d="M36 66H48"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        d="M80 66H92"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <rect
        x="32"
        y="70"
        width="10"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="32"
        y="86"
        width="10"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="44"
        y="70"
        width="8"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="44"
        y="86"
        width="8"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="76"
        y="70"
        width="8"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="76"
        y="86"
        width="8"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="86"
        y="70"
        width="10"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <rect
        x="86"
        y="86"
        width="10"
        height="14"
        rx="1.5"
        stroke={accentColor}
        strokeWidth="4.4"
      />
      <path
        d="M56 82H72V100H56V82Z"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinejoin="round"
      />
      <path
        d="M64 82V90"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        d="M64 40V22"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        d="M64 24C70 21.8 75.1 21.9 79 23.2V34C75.1 32.7 70 32.6 64 34.8"
        stroke={accentColor}
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
