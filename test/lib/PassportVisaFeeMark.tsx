import type { SVGProps } from 'react';

type PassportVisaFeeMarkProps = SVGProps<SVGSVGElement> & {
  accentColor: string;
  amount: string;
  currencySymbol: string;
};

export function PassportVisaFeeMark({
  accentColor,
  amount,
  currencySymbol,
  ...props
}: PassportVisaFeeMarkProps) {
  const displayAmount = amount.slice(0, 3);
  const hasCurrencySymbol = currencySymbol.length > 0;

  return (
    <svg viewBox="0 0 128 128" fill="none" aria-hidden="true" {...props}>
      {hasCurrencySymbol ? (
        <>
          <path
            d="M34 88A42 42 0 1 1 96 88"
            stroke={accentColor}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M34 88A42 42 0 0 0 52.5 101"
            stroke={accentColor}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M77.5 101A42 42 0 0 0 96 88"
            stroke={accentColor}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <text
            x="65"
            y="62"
            textAnchor="middle"
            fontSize="25"
            fontWeight="500"
            dominantBaseline="middle"
            fill={accentColor}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {displayAmount}
          </text>
          <text
            x="65"
            y="100"
            textAnchor="middle"
            fontSize="27"
            fontWeight="500"
            dominantBaseline="middle"
            fill={accentColor}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {currencySymbol}
          </text>
        </>
      ) : (
        <>
          <circle
            cx="65"
            cy="58"
            r="42.5"
            stroke={accentColor}
            strokeWidth="5"
          />
          <text
            x="65"
            y="62"
            textAnchor="middle"
            fontSize="25"
            fontWeight="500"
            dominantBaseline="middle"
            fill={accentColor}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            {displayAmount}
          </text>
        </>
      )}
    </svg>
  );
}
