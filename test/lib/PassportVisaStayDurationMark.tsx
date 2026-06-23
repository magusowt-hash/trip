import type { SVGProps } from 'react';

type PassportVisaStayDurationMarkProps = SVGProps<SVGSVGElement> & {
  accentColor: string;
  days: string;
};

export function PassportVisaStayDurationMark({
  accentColor,
  days,
  ...props
}: PassportVisaStayDurationMarkProps) {
  return (
    <svg viewBox="0 0 128 128" fill="none" aria-hidden="true" {...props}>
      <path
        d="M38 33.5C38 29.7 41.1 26.8 45 26.8C48.1 26.8 50.7 28.7 51.7 31.5L45.6 37.8C41.8 37.3 38 35.9 38 33.5Z"
        stroke={accentColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M90 33.5C90 29.7 86.9 26.8 83 26.8C79.9 26.8 77.3 28.7 76.3 31.5L82.4 37.8C86.2 37.3 90 35.9 90 33.5Z"
        stroke={accentColor}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M45.5 37.5L51.5 43.2" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M82.5 37.5L76.5 43.2" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path
        d="M52 95L47 101"
        stroke={accentColor}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M76 95L81 101"
        stroke={accentColor}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="64" cy="66.5" r="30.5" stroke={accentColor} strokeWidth="5" />
      <path d="M64 41.5V47.5" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M76.6 44.9L73.3 50" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M85.6 54L80.5 57.3" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M89 66.5H83" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M85.6 79L80.5 75.7" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M76.6 88.1L73.3 83" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M64 91.5V85.5" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M51.4 88.1L54.7 83" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M42.4 79L47.5 75.7" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M39 66.5H45" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M42.4 54L47.5 57.3" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <path d="M51.4 44.9L54.7 50" stroke={accentColor} strokeWidth="4" strokeLinecap="round" />
      <text
        x="64"
        y="68.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="23"
        fontWeight="500"
        fill={accentColor}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {days}
      </text>
    </svg>
  );
}
