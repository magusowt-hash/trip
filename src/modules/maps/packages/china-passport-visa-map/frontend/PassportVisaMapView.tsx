'use client';

import { useEffect, useMemo, useState } from 'react';
import { passportVisaLegend } from '../data/passportVisaLegend';
import { passportVisaCountries } from '../data/passportVisaCountries';
import {
  isPassportVisaInteractiveRegion,
  resolvePassportVisaCountryCode,
} from '../data/passportVisaRegionPolicy';
import styles from './PassportVisaMapView.module.css';

type PassportVisaMapViewProps = {
  selectedCountryCode: string | null;
  onCountrySelect: (countryCode: string) => void;
};

function buildColorMap() {
  return new Map(passportVisaLegend.map((item) => [item.group, item.color]));
}

export function PassportVisaMapView({
  selectedCountryCode,
  onCountrySelect,
}: PassportVisaMapViewProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const colorMap = useMemo(buildColorMap, []);
  const countryByCode = useMemo(
    () => new Map(passportVisaCountries.filter((item) => item.mapCountryCode).map((item) => [item.mapCountryCode, item])),
    [],
  );

  useEffect(() => {
    let active = true;

    fetch('/maps/passport-visa/world.svg')
      .then((response) => {
        if (!response.ok) {
          throw new Error('加载世界地图失败');
        }
        return response.text();
      })
      .then((text) => {
        if (!active) {
          return;
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svg = doc.querySelector('svg');

        if (!svg) {
          throw new Error('世界地图资源无效');
        }

        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.classList.add(styles.svgRoot);

        for (const path of Array.from(svg.querySelectorAll('path[id]'))) {
          const code = path.getAttribute('id');
          const resolvedCode = resolvePassportVisaCountryCode(code);
          const country = resolvedCode ? countryByCode.get(resolvedCode) : null;
          const fill = country ? colorMap.get(country.visaCategoryGroup) ?? '#cbd5e1' : '#e2e8f0';
          path.setAttribute('fill', fill);
          path.setAttribute('stroke', '#ffffff');
          path.setAttribute('stroke-width', '0.85');
          path.setAttribute('data-country-code', resolvedCode ?? '');
          path.setAttribute('class', styles.countryPath);

          if (country?.isHighRisk) {
            path.classList.add(styles.countryRisk);
          }

          if (selectedCountryCode && resolvedCode === selectedCountryCode) {
            path.classList.add(styles.countrySelected);
          }
        }

        setSvgMarkup(svg.outerHTML);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : '加载世界地图失败');
      });

    return () => {
      active = false;
    };
  }, [colorMap, countryByCode, selectedCountryCode]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    const code = target?.getAttribute('data-country-code');
    if (isPassportVisaInteractiveRegion(code)) {
      onCountrySelect(code);
    }
  };

  return (
    <div className={styles.frame}>
      <div className={styles.card}>
        {loadError ? <div className={styles.error}>{loadError}</div> : null}
        {!loadError && !svgMarkup ? <div className={styles.loading}>世界地图加载中…</div> : null}
        {!loadError && svgMarkup ? (
          <div
            className={styles.mapWrap}
            onClick={handleClick}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        ) : null}
      </div>
    </div>
  );
}
