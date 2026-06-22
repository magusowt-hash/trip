'use client';

import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  type PassportVisaDisplayGroup,
} from '../lib/passportVisaSeed.ts';
import type {
  PassportVisaBootstrapPayload,
  PassportVisaCountryRecord,
  PassportVisaThemeRecord,
} from '../lib/passportVisaAdminTypes.ts';
import {
  buildPassportVisaLegendFilterItems,
  type PassportVisaFilterMode,
} from '../lib/passportVisaLegendFilters.ts';
import {
  applyPassportVisaScenario,
  buildPassportVisaScenarioOptions,
  type PassportVisaScenarioId,
} from '../lib/passportVisaScenarios.ts';
import { applyPassportVisaMapPathPresentation } from '../lib/passportVisaMapColoring.ts';
import { isPassportVisaCountryInteractive } from '../lib/passportVisaInteraction.ts';
import {
  isPassportVisaCanonicalRegion,
  resolvePassportVisaCountryCode,
} from '../lib/passportVisaRegionPolicy.ts';
import {
  type PassportVisaOverlayActivePresentationState,
  PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS,
  PASSPORT_VISA_OVERLAY_FADE_DURATION_MS,
  getPassportVisaRenderedOverlayStates,
  getPassportVisaOverlayPresentationStyle,
  getPassportVisaOverlaySelector,
  getPassportVisaOverlayTransitionPlan,
  getPassportVisaSuppressedHoverCodeOnActivate,
  setPassportVisaOverlayCode,
} from '../lib/passportVisaOverlay.ts';
import {
  PASSPORT_VISA_MAX_ZOOM_SCALE,
  PASSPORT_VISA_MIN_ZOOM_SCALE,
  clampPassportVisaZoomViewBoxAtPoint,
  type PassportVisaViewBox,
  panPassportVisaViewBox,
  parsePassportVisaViewBox,
  zoomPassportVisaViewBoxAtPoint,
} from '../lib/passportVisaViewport.ts';
import {
  getPassportVisaDetailBadgePanelLayout,
  getPassportVisaDetailBadgePanelTop,
  getPassportVisaDetailExpandedMaxHeight,
  getPassportVisaDetailIconPanelLayout,
  getPassportVisaDetailIconPanelTop,
  getPassportVisaDetailInfoSpec,
  getPassportVisaDetailPreviewMaxHeight,
  getPassportVisaRiskBadgeClassName,
  shouldRenderPassportVisaReligiousLawBadge,
  shouldRenderPassportVisaRiskBadge,
  type PassportVisaDetailInfoTrigger,
} from '../lib/passportVisaDetailInfo.ts';
import { getPassportVisaFlagSrc } from '../lib/passportVisaFlag.ts';
import {
  getPassportVisaHoverCardMaxWidth,
  getPassportVisaHoverCardPosition,
  getPassportVisaHoverCardTitle,
} from '../lib/passportVisaHoverCard.ts';
import { shouldRenderPassportVisaDrawerBackdrop } from '../lib/passportVisaDrawerInteraction.ts';
import { PassportVisaRiskMark } from '../lib/passportVisaRiskMark.tsx';
import { applyPassportVisaNonScalingStroke } from '../lib/passportVisaSvgStroke.ts';
import styles from './PassportVisaPage.module.css';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const fallbackTheme: PassportVisaThemeRecord = {
  label: '沙棕',
  visaFree: '#D4A52A',
  arrivalOrEVisa: '#F0DEBF',
  visaRequired: '#8B5E3C',
  noData: '#F4F3F0',
  stroke: '#FFFDF9',
  accentStrong: '#6F4B2F',
};

function groupColor(group: PassportVisaDisplayGroup, theme: PassportVisaThemeRecord) {
  if (group === 'region-neutral') return theme.noData;
  if (group === 'visa-free') return theme.visaFree;
  if (group === 'arrival-or-evisa') return theme.arrivalOrEVisa;
  return theme.visaRequired;
}

function themeColor(group: PassportVisaDisplayGroup, theme: PassportVisaThemeRecord) {
  return groupColor(group, theme);
}

function getPassportVisaDisplayGroupLabel(group: PassportVisaDisplayGroup) {
  if (group === 'visa-free') return '免签';
  if (group === 'arrival-or-evisa') return '落地签 / 电子签';
  if (group === 'visa-required') return '需签证';
  return '无数据';
}

function countryMatchesFilter(country: PassportVisaCountryRecord, filterMode: PassportVisaFilterMode) {
  if (filterMode === 'all') return true;
  if (filterMode === 'high-risk') return country.riskLevel !== '低风险';
  return country.displayGroup === filterMode;
}

function collectOverlayElements(root: ParentNode) {
  const overlaysByCode = new Map<string, SVGElement[]>();

  for (const overlayPath of Array.from(root.querySelectorAll<SVGElement>(getPassportVisaOverlaySelector()))) {
    const code = overlayPath.getAttribute('data-overlay-code');
    if (!code) continue;

    const current = overlaysByCode.get(code) ?? [];
    current.push(overlayPath);
    overlaysByCode.set(code, current);
  }

  return overlaysByCode;
}

export default function PassportVisaClientPage() {
  const [mapMarkupVersion, setMapMarkupVersion] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countries, setCountries] = useState<PassportVisaCountryRecord[]>([]);
  const [scenarioDefinitions, setScenarioDefinitions] = useState<PassportVisaBootstrapPayload['scenarios']>([]);
  const [activeTheme, setActiveTheme] = useState<PassportVisaThemeRecord>(fallbackTheme);
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [selectedScenarios, setSelectedScenarios] = useState<PassportVisaScenarioId[]>([]);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<PassportVisaFilterMode>('all');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewDetailInfoState, setPreviewDetailInfoState] = useState<{
    trigger: PassportVisaDetailInfoTrigger;
  } | null>(null);
  const [expandedDetailInfoState, setExpandedDetailInfoState] = useState<{
    trigger: PassportVisaDetailInfoTrigger;
  } | null>(null);
  const [previewPanelLayout, setPreviewPanelLayout] = useState<{
    kind: 'badge' | 'icon';
    width: number;
    left: number;
    arrowLeft: number;
    top: number;
  } | null>(null);
  const [expandedPanelLayout, setExpandedPanelLayout] = useState<{
    kind: 'badge' | 'icon';
    width: number;
    left: number;
    arrowLeft: number;
    top: number;
  } | null>(null);
  const [previewPanelMaxHeight, setPreviewPanelMaxHeight] = useState<number | null>(null);
  const [expandedPanelMaxHeight, setExpandedPanelMaxHeight] = useState<number | null>(null);
  const [viewBox, setViewBox] = useState<PassportVisaViewBox | null>(null);
  const [hoveredOverlayCode, setHoveredOverlayCode] = useState<string | null>(null);
  const [hoverCardState, setHoverCardState] = useState<{
    countryCode: string;
    left: number;
    top: number;
    maxWidth: number;
  } | null>(null);
  const [suppressedHoverCode, setSuppressedHoverCode] = useState<string | null>(null);
  const [animatedOverlayCode, setAnimatedOverlayCode] = useState<string | null>(null);
  const [animatedOverlayState, setAnimatedOverlayState] = useState<PassportVisaOverlayActivePresentationState | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const flashFadeTimeoutRef = useRef<number | null>(null);
  const overlayFadeFrameRef = useRef<number | null>(null);
  const mapViewportRef = useRef<HTMLDivElement | null>(null);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const scenarioMenuRef = useRef<HTMLDetailsElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const svgMarkupRef = useRef('');
  const baseViewBoxRef = useRef<PassportVisaViewBox | null>(null);
  const overlayRenderedStateRef = useRef(new Map<string, 'hidden' | 'visible' | 'fading'>());
  const dragStateRef = useRef<{
    pointerId: number;
    countryCode: string | null;
    startX: number;
    startY: number;
    originViewBox: PassportVisaViewBox | null;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;

    fetch('/api/passport-visa/bootstrap')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('加载签证数据失败');
        }

        return response.json() as Promise<PassportVisaBootstrapPayload>;
      })
      .then((payload) => {
        if (!active) return;
        setCountries(payload.countries);
        setScenarioDefinitions(payload.scenarios);
        setActiveTheme(payload.theme);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : '加载签证数据失败');
      });

    return () => {
      active = false;
    };
  }, []);

  const countryByCode = useMemo(
    () => new Map(countries.map((country) => [country.mapCountryCode, country])),
    [countries],
  );
  const passportVisaScenarioOptions = useMemo(
    () => buildPassportVisaScenarioOptions(scenarioDefinitions),
    [scenarioDefinitions],
  );
  const effectiveCountries = useMemo(
    () => applyPassportVisaScenario(countries, selectedScenarios, scenarioDefinitions),
    [countries, selectedScenarios, scenarioDefinitions],
  );
  const effectiveCountryByCode = useMemo(
    () => new Map(effectiveCountries.map((country) => [country.mapCountryCode, country])),
    [effectiveCountries],
  );
  const legendFilterItems = useMemo(
    () => buildPassportVisaLegendFilterItems(effectiveCountries),
    [effectiveCountries],
  );
  const handleLegendFilterToggle = (nextFilterMode: PassportVisaDisplayGroup) => {
    setFilterMode((currentFilterMode) => (
      currentFilterMode === nextFilterMode ? 'all' : nextFilterMode
    ));
  };
  const visibleCountries = useMemo(
    () => effectiveCountries.filter((country) => (
      isPassportVisaCanonicalRegion(country.mapCountryCode)
      && countryMatchesFilter(country, filterMode)
    )),
    [effectiveCountries, filterMode],
  );
  const visibleCountryCodes = useMemo(
    () => new Set(visibleCountries.map((country) => country.mapCountryCode)),
    [visibleCountries],
  );
  const selectedCountry = selectedCountryCode ? countryByCode.get(selectedCountryCode) ?? null : null;
  const hoveredCountry = hoverCardState ? effectiveCountryByCode.get(hoverCardState.countryCode) ?? null : null;

  const previewDetailInfoContent = useMemo(() => {
    if (!selectedCountry || !previewDetailInfoState) return null;

    const spec = getPassportVisaDetailInfoSpec(selectedCountry, previewDetailInfoState.trigger);
    return {
      ...spec,
      isPreview: true,
    };
  }, [previewDetailInfoState, selectedCountry]);

  const expandedDetailInfoContent = useMemo(() => {
    if (!selectedCountry || !expandedDetailInfoState) return null;

    return getPassportVisaDetailInfoSpec(selectedCountry, expandedDetailInfoState.trigger);
  }, [expandedDetailInfoState, selectedCountry]);

  const filteredCountries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return visibleCountries;
    }

    return visibleCountries.filter((country) => (
      country.chineseName.toLowerCase().includes(normalized)
      || country.englishName.toLowerCase().includes(normalized)
      || country.mapCountryCode.toLowerCase().includes(normalized)
    ));
  }, [query, visibleCountries]);

  useEffect(() => {
    let active = true;

    fetch('/maps/passport-visa/world.svg')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('加载地图资源失败');
        }

        return response.text();
      })
      .then((svgMarkup) => {
        if (!active) return;

        svgMarkupRef.current = svgMarkup;
        setMapMarkupVersion((current) => current + 1);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : '加载地图资源失败');
      });

    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const container = mapViewportRef.current;
    if (!container) {
      return;
    }

    const svg = mapSvgRef.current;
    if (!svg) {
      return;
    }

    const resolvedViewBox = parsePassportVisaViewBox(svg);
    if (!resolvedViewBox) {
      return;
    }

    baseViewBoxRef.current = resolvedViewBox;
    setViewBox((current) => current ?? resolvedViewBox);
  }, [mapMarkupVersion]);

  useEffect(() => {
    const svg = mapSvgRef.current;
    if (!svg || !viewBox) {
      return;
    }

    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  }, [viewBox]);

  useEffect(() => {
    const svg = mapSvgRef.current;
    if (!svg || !svgMarkupRef.current || countries.length === 0) {
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgMarkupRef.current, 'image/svg+xml');
    const nextSvg = doc.querySelector('svg');

    if (!nextSvg) {
      return;
    }

    const overlayStates = getPassportVisaRenderedOverlayStates({
      animatedCode: animatedOverlayCode,
      animatedState: animatedOverlayState,
      hoveredCode: hoveredOverlayCode,
      previousStates: overlayRenderedStateRef.current,
      suppressedHoverCode,
    });

    for (const path of Array.from(nextSvg.querySelectorAll<SVGPathElement>('path[id]'))) {
      const sourceCode = path.getAttribute('id');
      if (!sourceCode) continue;

      const resolvedCode = resolvePassportVisaCountryCode(sourceCode);
      const country = resolvedCode ? effectiveCountryByCode.get(resolvedCode) ?? null : null;
      const presentation = country ? applyPassportVisaMapPathPresentation(country) : null;
      const fill = presentation ? themeColor(presentation.group, activeTheme) : activeTheme.noData;
      const isInteractive = resolvedCode ? isPassportVisaCountryInteractive(resolvedCode) : false;
      const isSelected = resolvedCode != null && resolvedCode === selectedCountryCode;

      path.setAttribute('fill', fill);
      path.setAttribute('stroke', activeTheme.stroke);
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('data-country-code', resolvedCode ?? '');

      applyPassportVisaNonScalingStroke(path);

      path.classList.add(styles.countryPath);

      if (isInteractive) {
        path.classList.add(styles.countryInteractive);
      }

      if (!presentation || !visibleCountryCodes.has(country.mapCountryCode)) {
        path.style.opacity = '0.42';
      } else {
        path.style.opacity = '1';
      }

      if (isSelected) {
        path.style.filter = `drop-shadow(0 0 0.9px ${activeTheme.accentStrong})`;
        path.style.stroke = activeTheme.accentStrong;
      }
    }

    const overlaysByCode = collectOverlayElements(nextSvg);
    overlayRenderedStateRef.current = overlayStates;

    for (const [countryCode, elements] of overlaysByCode.entries()) {
      const state = overlayStates.get(countryCode) ?? 'hidden';
      const style = getPassportVisaOverlayPresentationStyle(state);
      const transitionPlan = getPassportVisaOverlayTransitionPlan(state);
      const country = effectiveCountryByCode.get(countryCode);
      const presentation = country ? applyPassportVisaMapPathPresentation(country) : null;
      const overlayColor = presentation ? themeColor(presentation.group, activeTheme) : activeTheme.noData;

      for (const element of elements) {
        element.classList.add(styles.countryOverlay);
        element.setAttribute('fill', overlayColor);
        element.style.opacity = style.opacity;
        element.style.transition = transitionPlan.transition;
      }
    }

    svg.replaceWith(nextSvg);
    mapSvgRef.current = nextSvg as unknown as SVGSVGElement;
  }, [
    activeTheme,
    animatedOverlayCode,
    animatedOverlayState,
    countries.length,
    effectiveCountryByCode,
    hoveredOverlayCode,
    mapMarkupVersion,
    selectedCountryCode,
    suppressedHoverCode,
    visibleCountryCodes,
  ]);

  function clearFlashTimers() {
    if (flashTimeoutRef.current != null) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    if (flashFadeTimeoutRef.current != null) {
      window.clearTimeout(flashFadeTimeoutRef.current);
      flashFadeTimeoutRef.current = null;
    }
    if (overlayFadeFrameRef.current != null) {
      window.cancelAnimationFrame(overlayFadeFrameRef.current);
      overlayFadeFrameRef.current = null;
    }
  }

  function flashCountryOverlay(countryCode: string) {
    clearFlashTimers();

    const nextSuppressedHoverCode = getPassportVisaSuppressedHoverCodeOnActivate({
      activatedCode: countryCode,
      hoveredCode: hoveredOverlayCode,
    });

    setSuppressedHoverCode(nextSuppressedHoverCode);
    setAnimatedOverlayCode(countryCode);
    setAnimatedOverlayState('visible');
    setPassportVisaOverlayCode(countryCode);

    flashTimeoutRef.current = window.setTimeout(() => {
      flushSync(() => {
        setAnimatedOverlayState('fading');
      });

      overlayFadeFrameRef.current = window.requestAnimationFrame(() => {
        flashFadeTimeoutRef.current = window.setTimeout(() => {
          setAnimatedOverlayCode((current) => (current === countryCode ? null : current));
          setAnimatedOverlayState((current) => (current === 'fading' ? null : current));
          setSuppressedHoverCode((current) => (current === nextSuppressedHoverCode ? null : current));
        }, PASSPORT_VISA_OVERLAY_FADE_DURATION_MS);
      });
    }, PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS);
  }

  function openCountry(countryCode: string) {
    setSelectedCountryCode(countryCode);
    setIsDrawerOpen(true);
    setPreviewDetailInfoState(null);
    setExpandedDetailInfoState(null);
    flashCountryOverlay(countryCode);
  }

  function getPointerSvgCoordinates(clientX: number, clientY: number) {
    const svg = mapSvgRef.current;
    if (!svg) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    const matrix = svg.getScreenCTM();
    if (!matrix) {
      return null;
    }

    return point.matrixTransform(matrix.inverse());
  }

  function getCountryCodeFromEventTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.getAttribute('data-country-code');
  }

  function handleMapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const point = getPointerSvgCoordinates(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    const targetCountryCode = getCountryCodeFromEventTarget(event.target);

    dragStateRef.current = {
      pointerId: event.pointerId,
      countryCode: targetCountryCode,
      startX: event.clientX,
      startY: event.clientY,
      originViewBox: viewBox,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleMapPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;
    const point = getPointerSvgCoordinates(event.clientX, event.clientY);
    const nextHoveredCountryCode = getCountryCodeFromEventTarget(event.target);

    if (nextHoveredCountryCode && nextHoveredCountryCode !== suppressedHoverCode) {
      const hoveredCountryRecord = effectiveCountryByCode.get(nextHoveredCountryCode);
      if (hoveredCountryRecord) {
        setHoverCardState({
          countryCode: nextHoveredCountryCode,
          ...getPassportVisaHoverCardPosition(event.clientX, event.clientY),
          maxWidth: getPassportVisaHoverCardMaxWidth(window.innerWidth),
        });
      }
      setHoveredOverlayCode(nextHoveredCountryCode);
    } else {
      setHoverCardState(null);
      setHoveredOverlayCode(null);
    }

    if (!dragState || dragState.pointerId !== event.pointerId || !point || !dragState.originViewBox) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.moved && Math.hypot(deltaX, deltaY) > 3) {
      dragState.moved = true;
    }

    setViewBox(panPassportVisaViewBox(dragState.originViewBox, deltaX, deltaY));
  }

  function handleMapPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (!dragState.moved && dragState.countryCode && isPassportVisaCountryInteractive(dragState.countryCode)) {
      openCountry(dragState.countryCode);
    }

    dragStateRef.current = null;
  }

  function handleMapPointerLeave() {
    setHoverCardState(null);
    setHoveredOverlayCode(null);
  }

  function handleMapWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();

    const svgPoint = getPointerSvgCoordinates(event.clientX, event.clientY);
    if (!svgPoint || !viewBox) {
      return;
    }

    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextViewBox = zoomPassportVisaViewBoxAtPoint(viewBox, svgPoint.x, svgPoint.y, zoomFactor);
    setViewBox(clampPassportVisaZoomViewBoxAtPoint(nextViewBox, {
      minZoomScale: PASSPORT_VISA_MIN_ZOOM_SCALE,
      maxZoomScale: PASSPORT_VISA_MAX_ZOOM_SCALE,
      anchorX: svgPoint.x,
      anchorY: svgPoint.y,
      baseViewBox: baseViewBoxRef.current ?? nextViewBox,
    }));
  }

  useEffect(() => () => {
    clearFlashTimers();
  }, []);

  const previewPanelTop = previewPanelLayout
    ? (previewPanelLayout.kind === 'badge'
      ? getPassportVisaDetailBadgePanelTop(previewPanelLayout.top)
      : getPassportVisaDetailIconPanelTop(previewPanelLayout.top))
    : null;
  const expandedPanelTop = expandedPanelLayout
    ? (expandedPanelLayout.kind === 'badge'
      ? getPassportVisaDetailBadgePanelTop(expandedPanelLayout.top)
      : getPassportVisaDetailIconPanelTop(expandedPanelLayout.top))
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.mapStage}>
        <div className={styles.mapShell}>
          <div
            ref={mapViewportRef}
            className={styles.mapViewport}
            onPointerDown={handleMapPointerDown}
            onPointerMove={handleMapPointerMove}
            onPointerUp={handleMapPointerUp}
            onPointerLeave={handleMapPointerLeave}
            onWheel={handleMapWheel}
          >
            <div className={styles.mapTransformLayer}>
              <svg
                ref={mapSvgRef}
                className={styles.svgRoot}
                dangerouslySetInnerHTML={{ __html: svgMarkupRef.current }}
              />
            </div>
          </div>
        </div>
      </div>

      {hoverCardState && hoveredCountry ? (
        <div
          className={styles.mapHoverCard}
          style={{
            left: hoverCardState.left,
            top: hoverCardState.top,
            maxWidth: hoverCardState.maxWidth,
          }}
        >
          <div className={styles.mapHoverFlagBadge}>
            <img
              className={styles.mapHoverFlagImage}
              src={getPassportVisaFlagSrc(hoveredCountry.mapCountryCode)}
              alt=""
            />
          </div>
          <div className={styles.mapHoverTitle}>
            {getPassportVisaHoverCardTitle(hoveredCountry)}
          </div>
        </div>
      ) : null}

      <aside className={styles.legend}>
        <div className={styles.legendHeader}>
          <h2 className={styles.legendTitle}>China Passport Visa Map</h2>
          <details ref={scenarioMenuRef} className={styles.legendMenuWrap}>
            <summary className={styles.legendMenuButton}>+</summary>
            <div className={styles.legendScenarioPanel}>
              {passportVisaScenarioOptions.map((option) => {
                const isActive = selectedScenarios.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`${styles.legendScenarioOption} ${isActive ? styles.legendScenarioOptionActive : ''}`}
                    onClick={() => {
                      setSelectedScenarios((current) => (
                        current.includes(option.id)
                          ? current.filter((item) => item !== option.id)
                          : [...current, option.id]
                      ));
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </details>
        </div>
        <div className={styles.legendList}>
          {legendFilterItems.map((item) => {
            const isActive = filterMode === item.group;
            return (
              <button
                key={item.group}
                type="button"
                className={`${styles.legendItem} ${isActive ? styles.legendItemActive : ''}`}
                onClick={() => handleLegendFilterToggle(item.group)}
              >
                <span className={styles.legendDot} style={{ background: themeColor(item.group, activeTheme) }} />
                <span className={styles.legendLabel}>{getPassportVisaDisplayGroupLabel(item.group)}</span>
                <span className={styles.legendCount}>{item.count}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={styles.countryList}>
        <div className={styles.countryListSearchWrap}>
          <input
            className={styles.countryListSearch}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索国家或地区"
          />
        </div>
        <div className={styles.countryListInner}>
          {filteredCountries.map((country) => (
            <button
              key={country.mapCountryCode}
              type="button"
              className={`${styles.countryListItem} ${country.mapCountryCode === selectedCountryCode ? styles.countryListItemActive : ''}`}
              onClick={() => openCountry(country.mapCountryCode)}
            >
              <span className={styles.countryListName}>{country.chineseName}</span>
              <span className={styles.countryListMeta}>{country.englishName}</span>
            </button>
          ))}
        </div>
      </section>

      {loadError ? (
        <div className={styles.errorToast}>{loadError}</div>
      ) : null}

      {selectedCountry && isDrawerOpen ? (
        <>
          {shouldRenderPassportVisaDrawerBackdrop(isDrawerOpen) ? (
            <button
              type="button"
              className={styles.drawerBackdrop}
              onClick={() => setIsDrawerOpen(false)}
              aria-label="关闭详情"
            />
          ) : null}
          <section ref={drawerRef} className={styles.drawer}>
            <header className={styles.drawerHeader}>
              <div className={styles.drawerTitleBlock}>
                <div className={styles.drawerFlagBadge}>
                  <img
                    className={styles.drawerFlagImage}
                    src={getPassportVisaFlagSrc(selectedCountry.mapCountryCode)}
                    alt=""
                  />
                </div>
                <div className={styles.drawerTitleText}>
                  <h3 className={styles.drawerTitle}>{selectedCountry.chineseName}</h3>
                  <p className={styles.drawerSubtitle}>{selectedCountry.englishName}</p>
                </div>
              </div>
              <button
                type="button"
                className={styles.drawerClose}
                onClick={() => setIsDrawerOpen(false)}
                aria-label="关闭详情"
              >
                ×
              </button>
            </header>

            <div className={styles.drawerBadgeRow}>
              <button
                type="button"
                className={styles.drawerBadge}
                onMouseEnter={(event) => {
                  const nextLayout = getPassportVisaDetailBadgePanelLayout({
                    badgeRect: event.currentTarget.getBoundingClientRect(),
                    drawerRect: drawerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(),
                  });
                  setPreviewPanelLayout(nextLayout);
                  setPreviewPanelTop(getPassportVisaDetailBadgePanelTop(nextLayout.top));
                  setPreviewPanelMaxHeight(getPassportVisaDetailPreviewMaxHeight({
                    top: nextLayout.top,
                    drawerRect: drawerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(),
                  }));
                  setPreviewDetailInfoState({ trigger: 'entry-residence' });
                }}
                onMouseLeave={() => setPreviewDetailInfoState(null)}
                onClick={() => setExpandedDetailInfoState({ trigger: 'entry-residence' })}
              >
                {selectedCountry.rawLabel}
              </button>
              {shouldRenderPassportVisaRiskBadge(selectedCountry.riskLevel) ? (
                <button
                  type="button"
                  className={`${styles.drawerBadge} ${styles[getPassportVisaRiskBadgeClassName(selectedCountry.riskLevel)]}`}
                  onMouseEnter={(event) => {
                    const nextLayout = getPassportVisaDetailBadgePanelLayout({
                      badgeRect: event.currentTarget.getBoundingClientRect(),
                      drawerRect: drawerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(),
                    });
                    setPreviewPanelLayout(nextLayout);
                    setPreviewPanelTop(getPassportVisaDetailBadgePanelTop(nextLayout.top));
                    setPreviewPanelMaxHeight(getPassportVisaDetailPreviewMaxHeight({
                      top: nextLayout.top,
                      drawerRect: drawerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(),
                    }));
                    setPreviewDetailInfoState({ trigger: 'travel-risk-safety' });
                  }}
                  onMouseLeave={() => setPreviewDetailInfoState(null)}
                  onClick={() => setExpandedDetailInfoState({ trigger: 'travel-risk-safety' })}
                >
                  {selectedCountry.riskLevel}
                </button>
              ) : null}
              {shouldRenderPassportVisaReligiousLawBadge(selectedCountry.religiousLawRestrictions) ? (
                <button
                  type="button"
                  className={styles.drawerBadge}
                  onMouseEnter={(event) => {
                    const nextLayout = getPassportVisaDetailBadgePanelLayout({
                      badgeRect: event.currentTarget.getBoundingClientRect(),
                      drawerRect: drawerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(),
                    });
                    setPreviewPanelLayout(nextLayout);
                    setPreviewPanelTop(getPassportVisaDetailBadgePanelTop(nextLayout.top));
                    setPreviewPanelMaxHeight(getPassportVisaDetailPreviewMaxHeight({
                      top: nextLayout.top,
                      drawerRect: drawerRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect(),
                    }));
                    setPreviewDetailInfoState({ trigger: 'religious-law-restrictions' });
                  }}
                  onMouseLeave={() => setPreviewDetailInfoState(null)}
                  onClick={() => setExpandedDetailInfoState({ trigger: 'religious-law-restrictions' })}
                >
                  教法约束
                </button>
              ) : null}
            </div>

            <div className={styles.drawerMetaGrid}>
              <article className={styles.drawerMetaCard}>
                <h4 className={styles.drawerMetaTitle}>停留时间</h4>
                <p className={styles.drawerMetaText}>{selectedCountry.stayDuration || '未提供'}</p>
              </article>
              <article className={styles.drawerMetaCard}>
                <h4 className={styles.drawerMetaTitle}>签证费用</h4>
                <p className={styles.drawerMetaText}>{selectedCountry.visaFee || '未提供'}</p>
              </article>
              <article className={styles.drawerMetaCard}>
                <h4 className={styles.drawerMetaTitle}>签证官网</h4>
                <p className={styles.drawerMetaText}>{selectedCountry.officialVisaUrl || '未提供'}</p>
              </article>
              <article className={styles.drawerMetaCard}>
                <h4 className={styles.drawerMetaTitle}>使馆信息</h4>
                <p className={styles.drawerMetaText}>{selectedCountry.embassyUrl || '未提供'}</p>
              </article>
            </div>

            {previewDetailInfoContent && previewPanelLayout && previewPanelTop != null ? (
              <section
                className={styles.detailInfoPreview}
                style={{
                  width: previewPanelLayout.width,
                  left: previewPanelLayout.left,
                  top: previewPanelTop,
                  ['--passport-visa-arrow-left' as keyof CSSProperties]: `${previewPanelLayout.arrowLeft}px`,
                  maxHeight: previewPanelMaxHeight ?? undefined,
                } as CSSProperties}
              >
                <h4 className={styles.detailInfoTitle}>{previewDetailInfoContent.title}</h4>
                <p className={styles.detailInfoCopy}>{previewDetailInfoContent.content || previewDetailInfoContent.emptyLabel}</p>
              </section>
            ) : null}

            {expandedDetailInfoContent && expandedPanelLayout && expandedPanelTop != null ? (
              <section
                className={styles.detailInfoExpanded}
                style={{
                  width: expandedPanelLayout.width,
                  left: expandedPanelLayout.left,
                  top: expandedPanelTop,
                  ['--passport-visa-arrow-left' as keyof CSSProperties]: `${expandedPanelLayout.arrowLeft}px`,
                  maxHeight: expandedPanelMaxHeight ?? undefined,
                } as CSSProperties}
              >
                <h4 className={styles.detailInfoTitle}>{expandedDetailInfoContent.title}</h4>
                <p className={styles.detailInfoCopy}>{expandedDetailInfoContent.content || expandedDetailInfoContent.emptyLabel}</p>
              </section>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
