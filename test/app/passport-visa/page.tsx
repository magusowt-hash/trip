'use client';

import type { CSSProperties } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  type PassportVisaDisplayGroup,
} from '../../lib/passportVisaSeed';
import type {
  PassportVisaBootstrapPayload,
  PassportVisaCountryRecord,
  PassportVisaThemeRecord,
} from '../../lib/passportVisaAdminTypes';
import {
  buildPassportVisaLegendFilterItems,
  type PassportVisaFilterMode,
} from '../../lib/passportVisaLegendFilters';
import {
  applyPassportVisaScenario,
  buildPassportVisaScenarioOptions,
  type PassportVisaScenarioId,
} from '../../lib/passportVisaScenarios';
import { applyPassportVisaMapPathPresentation } from '../../lib/passportVisaMapColoring';
import { isPassportVisaCountryInteractive } from '../../lib/passportVisaInteraction.ts';
import {
  isPassportVisaCanonicalRegion,
  resolvePassportVisaCountryCode,
} from '../../lib/passportVisaRegionPolicy';
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
} from '../../lib/passportVisaOverlay';
import {
  PASSPORT_VISA_MAX_ZOOM_SCALE,
  PASSPORT_VISA_MIN_ZOOM_SCALE,
  clampPassportVisaZoomViewBoxAtPoint,
  type PassportVisaViewBox,
  panPassportVisaViewBox,
  parsePassportVisaViewBox,
  zoomPassportVisaViewBoxAtPoint,
} from '../../lib/passportVisaViewport';
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
} from '../../lib/passportVisaDetailInfo.ts';
import { getPassportVisaFlagSrc } from '../../lib/passportVisaFlag';
import {
  getPassportVisaHoverCardMaxWidth,
  getPassportVisaHoverCardPosition,
  getPassportVisaHoverCardTitle,
} from '../../lib/passportVisaHoverCard.ts';
import { shouldRenderPassportVisaDrawerBackdrop } from '../../lib/passportVisaDrawerInteraction.ts';
import { PassportVisaRiskMark } from '../../lib/passportVisaRiskMark.tsx';
import { PassportVisaOfficialSiteMark } from '../../lib/PassportVisaOfficialSiteMark.tsx';
import { PassportVisaEmbassySiteMark } from '../../lib/PassportVisaEmbassySiteMark.tsx';
import { PassportVisaFeeMark } from '../../lib/PassportVisaFeeMark.tsx';
import { PassportVisaStayDurationMark } from '../../lib/PassportVisaStayDurationMark.tsx';
import {
  parsePassportVisaFeeDisplay,
  parsePassportVisaStayDurationDisplay,
} from '../../lib/passportVisaFeeDisplay.ts';
import { applyPassportVisaNonScalingStroke } from '../../lib/passportVisaSvgStroke';
import styles from './page.module.css';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const fallbackTheme: PassportVisaThemeRecord = {
  label: '沙棕',
  visaFree: '#D4A52A',
  arrivalOrEVisa: '#F0DEBF',
  visaRequired: '#8B5E3C',
  noData: '#EFEDE8',
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

export default function PassportVisaPage() {
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
  const parsedVisaFee = useMemo(
    () => parsePassportVisaFeeDisplay(selectedCountry?.visaFee),
    [selectedCountry],
  );
  const parsedVisaFeeWithSymbol = parsedVisaFee?.currencySymbol ? parsedVisaFee : null;
  const parsedStayDuration = useMemo(
    () => parsePassportVisaStayDurationDisplay(selectedCountry?.stayDuration),
    [selectedCountry],
  );
  const hoveredCountry = hoverCardState ? effectiveCountryByCode.get(hoverCardState.countryCode) ?? null : null;
  const previewDetailInfoContent = useMemo(() => {
    if (!selectedCountry || !previewDetailInfoState) return null;

    const spec = getPassportVisaDetailInfoSpec(selectedCountry, previewDetailInfoState.trigger);
    return {
      ...spec,
      trigger: previewDetailInfoState.trigger,
      body: spec.content || spec.emptyLabel,
    };
  }, [previewDetailInfoState, selectedCountry]);
  const expandedDetailInfoContent = useMemo(() => {
    if (!selectedCountry || !expandedDetailInfoState) return null;

    const spec = getPassportVisaDetailInfoSpec(selectedCountry, expandedDetailInfoState.trigger);
    return {
      ...spec,
      trigger: expandedDetailInfoState.trigger,
      body: spec.content || spec.emptyLabel,
    };
  }, [expandedDetailInfoState, selectedCountry]);
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return visibleCountries.filter((country) => (
      country.englishName.toLowerCase().includes(normalized)
      || country.chineseName.toLowerCase().includes(normalized)
    ));
  }, [query, visibleCountries]);
  const pageThemeStyle = useMemo(
    () => ({
      '--theme-accent-strong': activeTheme.accentStrong,
    }) as CSSProperties,
    [activeTheme],
  );
  const riskBadgeToneClassNameByLevel = {
    low: styles.badgeRiskLow,
    medium: styles.badgeRiskMedium,
    high: styles.badgeRiskHigh,
    blocked: styles.badgeRiskBlocked,
  } as const;

  type DetailInfoPanelLayoutState = {
    kind: 'badge' | 'icon';
    width: number;
    left: number;
    arrowLeft: number;
    top: number;
  };

  const showDetailInfoPreview = (trigger: PassportVisaDetailInfoTrigger) => {
    setPreviewDetailInfoState({ trigger });
  };

  const hideDetailInfoPreview = (trigger: PassportVisaDetailInfoTrigger) => {
    setPreviewDetailInfoState((current) => (current?.trigger === trigger ? null : current));
  };

  const getDetailPanelLayout = (target: HTMLElement): DetailInfoPanelLayoutState | null => {
    const drawer = drawerRef.current;
    const targetRect = target.getBoundingClientRect();
    const drawerRect = drawer?.getBoundingClientRect();
    if (!drawerRect) return null;

    const triggerLeft = targetRect.left - drawerRect.left;
    const triggerWidth = targetRect.width;
    const viewportWidth = window.innerWidth;

    if (target.classList.contains(styles.riskMarkButton)) {
      const layout = getPassportVisaDetailIconPanelLayout({
        triggerLeft,
        triggerWidth,
        drawerWidth: drawerRect.width,
        viewportWidth,
        sectionInset: 18,
      });
      const iconTop = getPassportVisaDetailIconPanelTop({
        triggerBottom: targetRect.bottom,
        drawerTop: drawerRect.top,
      });
      return { kind: 'icon' as const, ...layout, top: iconTop.top };
    }

    const badgeLayout = getPassportVisaDetailBadgePanelLayout({
      drawerWidth: drawerRect.width,
      viewportWidth,
      sectionInset: 18,
    });
    const firstSection = drawer?.querySelector<HTMLElement>(`.${styles.section}`) ?? null;
    const firstSectionRect = firstSection?.getBoundingClientRect();
    const badgeTop = firstSectionRect
      ? getPassportVisaDetailBadgePanelTop({
        firstSectionTop: firstSectionRect.top,
        drawerTop: drawerRect.top,
      }).top
      : 0;
    return {
      kind: 'badge' as const,
      ...badgeLayout,
      top: badgeTop,
      arrowLeft: Math.min(
        badgeLayout.width - 18,
        Math.max(18, triggerLeft + (triggerWidth / 2) - badgeLayout.left),
      ),
    };
  };

  const previewDetailInfo = (
    trigger: PassportVisaDetailInfoTrigger,
    target: HTMLElement,
  ) => {
    const layout = getDetailPanelLayout(target);
    if (!layout) return;
    const drawer = drawerRef.current;
    const drawerRect = drawer?.getBoundingClientRect();
    const nextPreviewMaxHeight = drawerRect
      ? getPassportVisaDetailPreviewMaxHeight({
        kind: layout.kind,
        drawerHeight: drawerRect.height,
        panelTop: layout.top,
        viewportWidth: window.innerWidth,
        bottomInset: 10,
      })
      : null;
    setPreviewPanelLayout(layout);
    setPreviewPanelMaxHeight(nextPreviewMaxHeight);
    showDetailInfoPreview(trigger);
  };

  const toggleExpandedDetailInfo = (
    trigger: PassportVisaDetailInfoTrigger,
    target: HTMLElement,
  ) => {
    const layout = getDetailPanelLayout(target);
    if (!layout) return;
    const drawer = drawerRef.current;
    const drawerRect = drawer?.getBoundingClientRect();
    const nextExpandedMaxHeight = drawerRect
      ? getPassportVisaDetailExpandedMaxHeight({
        drawerHeight: drawerRect.height,
        panelTop: layout.top,
        bottomInset: 10,
      })
      : null;

    setPreviewDetailInfoState(null);
    setExpandedPanelLayout(layout);
    setExpandedPanelMaxHeight(nextExpandedMaxHeight);
    setExpandedDetailInfoState((current) => (
      current?.trigger === trigger ? null : { trigger }
    ));
  };

  const getDetailInfoInteractiveProps = (
    trigger: PassportVisaDetailInfoTrigger,
    options?: { badge?: boolean },
  ) => ({
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      if (options?.badge || event.currentTarget instanceof HTMLButtonElement) {
        previewDetailInfo(trigger, event.currentTarget as HTMLElement);
        return;
      }
      showDetailInfoPreview(trigger);
    },
    onMouseLeave: () => hideDetailInfoPreview(trigger),
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      if (options?.badge || event.currentTarget instanceof HTMLButtonElement) {
        previewDetailInfo(trigger, event.currentTarget as HTMLElement);
        return;
      }
      showDetailInfoPreview(trigger);
    },
    onBlur: () => hideDetailInfoPreview(trigger),
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      toggleExpandedDetailInfo(trigger, event.currentTarget as HTMLElement);
    },
  });

  useEffect(() => {
    if (!isDrawerOpen || !selectedCountry) {
      setPreviewDetailInfoState(null);
      setExpandedDetailInfoState(null);
      setPreviewPanelLayout(null);
      setExpandedPanelLayout(null);
      setPreviewPanelMaxHeight(null);
      setExpandedPanelMaxHeight(null);
    }
  }, [isDrawerOpen, selectedCountry]);

  useEffect(() => {
    if (!expandedDetailInfoState) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedDetailInfoState(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedDetailInfoState]);

  useEffect(() => {
    if (!isDrawerOpen || !selectedCountry) return;

    const handlePointerDownOutsideDrawer = (event: PointerEvent) => {
      const drawer = drawerRef.current;
      const target = event.target as Node | null;
      if (!drawer || !target) return;
      if (drawer.contains(target)) return;

      if (expandedDetailInfoState) {
        setExpandedDetailInfoState(null);
        return;
      }

      setIsDrawerOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDownOutsideDrawer);
    return () => window.removeEventListener('pointerdown', handlePointerDownOutsideDrawer);
  }, [expandedDetailInfoState, isDrawerOpen, selectedCountry]);

  useEffect(() => {
    let active = true;

    fetch('/maps/passport-visa/world.svg')
      .then((response) => {
        if (!response.ok) throw new Error('加载世界地图失败');
        return response.text();
      })
      .then((text) => {
        if (!active) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'image/svg+xml');
        const svg = doc.querySelector('svg');

        if (!svg) {
          throw new Error('世界地图资源无效');
        }

        const parsedViewBox = parsePassportVisaViewBox(
          svg.getAttribute('viewBox'),
          svg.getAttribute('width'),
          svg.getAttribute('height'),
        );

        if (!parsedViewBox) {
          throw new Error('世界地图缺少有效 viewBox');
        }

        const overlayLayer = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
        overlayLayer.setAttribute('class', styles.overlayLayer);
        overlayLayer.setAttribute('pointer-events', 'none');

        for (const path of Array.from(svg.querySelectorAll('path[id]'))) {
          const code = path.getAttribute('id');
          const resolvedCode = resolvePassportVisaCountryCode(code);
          path.setAttribute('stroke', activeTheme.stroke);
          path.setAttribute('data-country-code', resolvedCode ?? '');
          applyPassportVisaNonScalingStroke(path, '0.9');
          path.setAttribute('class', styles.countryPath);
          if (resolvedCode) {
            path.classList.add(styles.countryInteractive);
            const overlayPath = path.cloneNode(true);
            if (overlayPath instanceof Element) {
              overlayPath.removeAttribute('id');
              overlayPath.removeAttribute('data-country-code');
              setPassportVisaOverlayCode(overlayPath, resolvedCode ?? '');
              overlayPath.setAttribute('class', styles.countryOverlay);
              overlayPath.setAttribute('opacity', '0');
              overlayPath.setAttribute('pointer-events', 'none');
              overlayPath.setAttribute('fill', '#111111');
              overlayPath.setAttribute('stroke', 'none');
              overlayPath.setAttribute('vector-effect', 'non-scaling-stroke');

              overlayLayer.appendChild(overlayPath);
            }
          }
        }

        svg.appendChild(overlayLayer);

        baseViewBoxRef.current = parsedViewBox;
        svgMarkupRef.current = svg.innerHTML;
        setViewBox(parsedViewBox);
        setMapMarkupVersion((current) => current + 1);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : '加载世界地图失败');
      });

    return () => {
      active = false;
    };
  }, [activeTheme.stroke]);

  useLayoutEffect(() => {
    const root = mapSvgRef.current;
    if (!root || mapMarkupVersion === 0) return;

    root.innerHTML = svgMarkupRef.current;
  }, [mapMarkupVersion]);

  useLayoutEffect(() => {
    const root = mapSvgRef.current;
    if (!root) return;

    for (const path of Array.from(root.querySelectorAll<SVGElement>('path[id]'))) {
      const code = path.getAttribute('id');
      const resolvedCode = resolvePassportVisaCountryCode(code);
      if (!resolvedCode) continue;
      const country = effectiveCountryByCode.get(resolvedCode);
      if (!country) continue;

      applyPassportVisaMapPathPresentation(path, {
        baseFill: groupColor(country.displayGroup, activeTheme),
        isActive: selectedCountryCode === resolvedCode && isDrawerOpen,
        isFaded: !visibleCountryCodes.has(resolvedCode),
      });
    }

    const overlaysByCode = collectOverlayElements(root);
    const nextRenderedOverlayStates = getPassportVisaRenderedOverlayStates({
      currentCode: animatedOverlayCode,
      currentState: animatedOverlayState,
      hoveredCode: hoveredOverlayCode,
      suppressedHoverCode,
      previousStates: overlayRenderedStateRef.current,
    });

    for (const [code, overlayElements] of overlaysByCode) {
      const nextOverlayState = nextRenderedOverlayStates.get(code) ?? 'hidden';
      const style = getPassportVisaOverlayPresentationStyle(nextOverlayState);

      for (const overlayElement of overlayElements) {
        overlayElement.setAttribute('opacity', style.opacity);
        overlayElement.style.transition = style.transition;
      }
    }

    overlayRenderedStateRef.current = nextRenderedOverlayStates;
  }, [
    activeTheme,
    animatedOverlayCode,
    animatedOverlayState,
    effectiveCountryByCode,
    hoveredOverlayCode,
    isDrawerOpen,
    mapMarkupVersion,
    selectedCountryCode,
    suppressedHoverCode,
    visibleCountryCodes,
  ]);

  useEffect(() => () => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    if (flashFadeTimeoutRef.current !== null) {
      window.clearTimeout(flashFadeTimeoutRef.current);
    }
    if (overlayFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(overlayFadeFrameRef.current);
    }
  }, []);

  const startHoverFade = (code: string) => {
    const transitionPlan = getPassportVisaOverlayTransitionPlan({
      currentCode: animatedOverlayCode,
      currentState: animatedOverlayState,
      nextCode: code,
      reason: 'hover-leave',
    });

    if (!transitionPlan) return;

    setAnimatedOverlayCode(transitionPlan.nextCode);
    setAnimatedOverlayState(transitionPlan.nextState);

    if (overlayFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(overlayFadeFrameRef.current);
    }

    overlayFadeFrameRef.current = window.requestAnimationFrame(() => {
      setAnimatedOverlayCode((currentCode) => (
        currentCode === code ? null : currentCode
      ));
      setAnimatedOverlayState(null);
      overlayFadeFrameRef.current = null;
    });
  };

  const activateCountry = (code: string) => {
    if (flashTimeoutRef.current !== null) {
      window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    if (flashFadeTimeoutRef.current !== null) {
      window.clearTimeout(flashFadeTimeoutRef.current);
      flashFadeTimeoutRef.current = null;
    }
    if (overlayFadeFrameRef.current !== null) {
      window.cancelAnimationFrame(overlayFadeFrameRef.current);
      overlayFadeFrameRef.current = null;
    }

    flushSync(() => {
      setSuppressedHoverCode(getPassportVisaSuppressedHoverCodeOnActivate(
        hoveredOverlayCode,
        code,
      ));
      setAnimatedOverlayCode(code);
      setAnimatedOverlayState('visible');
      setSelectedCountryCode(code);
      setIsDrawerOpen(true);
    });

    flashTimeoutRef.current = window.setTimeout(() => {
      setAnimatedOverlayCode((currentAnimatedCode) => {
        if (currentAnimatedCode !== code) {
          return currentAnimatedCode;
        }

        setAnimatedOverlayState('fading');
        flashTimeoutRef.current = null;
        return currentAnimatedCode;
      });
    }, PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS);

    flashFadeTimeoutRef.current = window.setTimeout(() => {
      setAnimatedOverlayCode((currentAnimatedCode) => {
        if (currentAnimatedCode !== code) {
          return currentAnimatedCode;
        }

        setAnimatedOverlayState(null);
        flashFadeTimeoutRef.current = null;
        return null;
      });
    }, PASSPORT_VISA_OVERLAY_HOLD_DURATION_MS + PASSPORT_VISA_OVERLAY_FADE_DURATION_MS);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    const countryNode = target?.closest('[data-country-code]');
    const countryCode = countryNode?.getAttribute('data-country-code') ?? null;

    dragStateRef.current = {
      pointerId: event.pointerId,
      countryCode,
      startX: event.clientX,
      startY: event.clientY,
      originViewBox: viewBox,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const hoverTarget = event.target as HTMLElement | null;
    const hoverNode = hoverTarget?.closest('[data-country-code]');
    const hoverCode = hoverNode?.getAttribute('data-country-code') ?? null;

    if (
      hoveredOverlayCode
      && hoveredOverlayCode !== hoverCode
      && (!animatedOverlayCode || animatedOverlayState === 'fading')
    ) {
      startHoverFade(hoveredOverlayCode);
    }

    setHoveredOverlayCode(hoverCode);
    if (hoverCode && isPassportVisaCountryInteractive(effectiveCountryByCode.get(hoverCode) ?? null)) {
      const hoverCardPosition = getPassportVisaHoverCardPosition({
        pointerX: event.clientX,
        pointerY: event.clientY,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        cardWidth: 220,
        cardHeight: 52,
        offsetX: 18,
        offsetY: 18,
        edgePadding: 16,
      });
      const hoverCardMaxWidth = getPassportVisaHoverCardMaxWidth({
        viewportWidth: window.innerWidth,
        edgePadding: 16,
        preferredMaxWidth: 320,
      });
      setHoverCardState({
        countryCode: hoverCode,
        ...hoverCardPosition,
        maxWidth: hoverCardMaxWidth,
      });
    } else {
      setHoverCardState(null);
    }
    if (suppressedHoverCode && hoverCode !== suppressedHoverCode) {
      setSuppressedHoverCode(null);
    }

    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (!dragState.moved && Math.hypot(deltaX, deltaY) > 4) {
      dragState.moved = true;
    }

    if (!dragState.moved) return;

    const viewport = mapViewportRef.current;
    if (!viewport || !dragState.originViewBox) return;

    setViewBox(
      panPassportVisaViewBox(
        dragState.originViewBox,
        deltaX,
        deltaY,
        viewport.clientWidth,
        viewport.clientHeight,
      ),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!dragState.moved && dragState.countryCode && isPassportVisaCountryInteractive(effectiveCountryByCode.get(dragState.countryCode) ?? null)) {
      activateCountry(dragState.countryCode);
    }

    if (!dragState.moved && !dragState.countryCode) {
      setIsDrawerOpen(false);
    }

    dragStateRef.current = null;
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStateRef.current = null;
  };

  const handlePointerLeave = () => {
    if (hoveredOverlayCode && (!animatedOverlayCode || animatedOverlayState === 'fading')) {
      startHoverFade(hoveredOverlayCode);
    }

    setHoveredOverlayCode(null);
    setHoverCardState(null);
    if (suppressedHoverCode) {
      setSuppressedHoverCode(null);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();

    const viewport = mapViewportRef.current;
    if (!viewport || !viewBox) return;

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.12 : 0.9;
    const baseViewBox = baseViewBoxRef.current;
    if (!baseViewBox) return;

    const nextViewBox = zoomPassportVisaViewBoxAtPoint(
      viewBox,
      pointerX,
      pointerY,
      rect.width,
      rect.height,
      zoomFactor,
    );
    setViewBox(
      clampPassportVisaZoomViewBoxAtPoint(
        baseViewBox,
        nextViewBox,
        pointerX,
        pointerY,
        rect.width,
        rect.height,
        PASSPORT_VISA_MIN_ZOOM_SCALE,
        PASSPORT_VISA_MAX_ZOOM_SCALE,
      ),
    );
  };

  return (
    <main className={styles.page} style={pageThemeStyle}>
      <div className={styles.mapStage}>
        <div className={styles.mapShell}>
          {loadError ? <div className={styles.noResults}>{loadError}</div> : null}
          {!loadError && mapMarkupVersion > 0 && viewBox ? (
            <div
              ref={mapViewportRef}
              className={styles.mapViewport}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={handlePointerLeave}
              onWheel={handleWheel}
            >
              <svg
                ref={mapSvgRef}
                className={styles.svgRoot}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
                preserveAspectRatio="xMidYMid meet"
              />
            </div>
          ) : null}
        </div>
      </div>

      {hoveredCountry && hoverCardState ? (
        <section
          className={styles.mapHoverCard}
          style={{
            left: hoverCardState.left,
            top: hoverCardState.top,
            maxWidth: hoverCardState.maxWidth,
          }}
          role="status"
          aria-live="polite"
        >
          <span className={styles.mapHoverFlagBadge}>
            <img
              className={styles.mapHoverFlagImage}
              src={getPassportVisaFlagSrc(hoveredCountry.mapCountryCode)}
              alt=""
            />
          </span>
          <span className={styles.mapHoverTitle}>
            {getPassportVisaHoverCardTitle(hoveredCountry)}
          </span>
        </section>
      ) : null}

      <aside className={styles.legend}>
        <div className={styles.legendHeader}>
          <h2 className={styles.legendTitle}>Visa Legend</h2>
          <details ref={scenarioMenuRef} className={styles.legendMenuWrap}>
            <summary
              className={styles.legendMenuButton}
              aria-label="打开签证场景菜单"
            >
              ≡
            </summary>
            <div className={styles.legendScenarioPanel}>
              {passportVisaScenarioOptions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.legendScenarioOption} ${selectedScenarios.includes(item.id) ? styles.legendScenarioOptionActive : ''}`}
                  onClick={() => {
                    setSelectedScenarios((current) => (
                      current.includes(item.id)
                        ? current.filter((scenarioId) => scenarioId !== item.id)
                        : [...current, item.id]
                    ));
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className={styles.legendList}>
          {legendFilterItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.legendFilterButton} ${filterMode === item.key ? styles.legendFilterButtonActive : ''}`}
              onClick={() => handleLegendFilterToggle(item.key)}
            >
              <div className={styles.legendRow}>
                <span
                  className={styles.legendDot}
                  style={{ background: themeColor(item.key, activeTheme) }}
                />
                <span>{item.label}</span>
                <span className={styles.legendCount}>{item.count}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {query.trim() ? (
        <section className={styles.resultsTray}>
          {searchResults.length === 0 ? <div className={styles.noResults}>没有找到匹配国家。</div> : null}
          {searchResults.map((country) => (
            <button
              key={country.mapCountryCode}
              type="button"
              className={styles.resultButton}
              onClick={() => {
                if (isPassportVisaCountryInteractive(country)) {
                  activateCountry(country.mapCountryCode);
                }
              }}
            >
              <article className={styles.resultCard}>
                <h3 className={styles.resultTitle}>{country.chineseName}</h3>
                <p className={styles.resultMeta}>{country.englishName} · {country.rawLabel}</p>
              </article>
            </button>
          ))}
        </section>
      ) : null}

      {shouldRenderPassportVisaDrawerBackdrop({
        isDrawerOpen,
        hasSelectedCountry: Boolean(selectedCountry),
      }) ? (
        <button
          type="button"
          aria-label="关闭详情"
          className={styles.drawerBackdrop}
          onClick={() => {
            if (expandedDetailInfoState) {
              setExpandedDetailInfoState(null);
              return;
            }
            setIsDrawerOpen(false);
          }}
        />
      ) : null}

      <section
        ref={drawerRef}
        className={`${styles.drawer} ${isDrawerOpen && selectedCountry ? styles.drawerOpen : ''}`}
      >
        {selectedCountry ? (
          <>
            <header className={styles.drawerHeader}>
              <div className={styles.drawerHeaderMain}>
                <div className={styles.drawerTitleBlock}>
                  <div className={styles.drawerTitleRow}>
                    <span className={styles.flagBadge}>
                      <img
                        className={styles.flagImage}
                        src={getPassportVisaFlagSrc(selectedCountry.mapCountryCode)}
                        alt={`${selectedCountry.chineseName}国旗`}
                      />
                    </span>
                    <div className={styles.drawerTitleText}>
                      <h2 className={styles.drawerTitle}>{selectedCountry.chineseName}</h2>
                      <p className={styles.drawerSub}>{selectedCountry.englishName}</p>
                    </div>
                  </div>
                </div>
                <div className={`${styles.detailInfoAnchor} ${styles.detailInfoAnchorIcon}`}>
                  <button
                    type="button"
                    className={styles.riskMarkButton}
                    aria-label={`查看安全防范：${selectedCountry.riskLevel}`}
                    {...getDetailInfoInteractiveProps('safety-precaution')}
                  >
                    <span className={styles.riskMarkWrap}>
                      <PassportVisaRiskMark
                        riskLevel={selectedCountry.riskLevel}
                        className={styles.riskMark}
                      />
                    </span>
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setIsDrawerOpen(false)}
              >
                ×
              </button>
            </header>

            <div className={styles.drawerScroll}>
              <div
                className={`${styles.drawerCanvas} ${
                  selectedCountry.officialVisaUrl || selectedCountry.embassyUrl || parsedVisaFeeWithSymbol || parsedStayDuration
                    ? styles.drawerCanvasWithUtilities
                    : styles.drawerCanvasWithoutUtilities
                }`}
              >
                {selectedCountry.officialVisaUrl || selectedCountry.embassyUrl || parsedVisaFeeWithSymbol || parsedStayDuration ? (
                  <div className={styles.utilityRow}>
                    {selectedCountry.officialVisaUrl ? (
                      <a
                        className={styles.officialVisaEntry}
                        href={selectedCountry.officialVisaUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="打开官方签证网站"
                        title="官方签证网站"
                        data-tooltip="官方签证网站"
                      >
                        <PassportVisaOfficialSiteMark
                          className={styles.officialVisaEntryIcon}
                          accentColor={themeColor(selectedCountry.displayGroup, activeTheme)}
                        />
                      </a>
                    ) : null}
                    {selectedCountry.embassyUrl ? (
                      <a
                        className={styles.officialVisaEntry}
                        href={selectedCountry.embassyUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="打开中国驻当地使馆网站"
                        title="中国驻当地使馆网站"
                        data-tooltip="中国驻当地使馆网站"
                      >
                        <PassportVisaEmbassySiteMark
                          className={styles.officialVisaEntryIcon}
                          accentColor={themeColor(selectedCountry.displayGroup, activeTheme)}
                        />
                      </a>
                    ) : null}
                    {parsedVisaFeeWithSymbol ? (
                      <div
                        className={`${styles.officialVisaEntry} ${styles.officialVisaEntryFee}`}
                        aria-label="签证费图标"
                        title="签证费"
                        data-tooltip="签证费"
                      >
                        <PassportVisaFeeMark
                          className={`${styles.officialVisaEntryIcon} ${styles.officialVisaEntryFeeIcon}`}
                          accentColor={themeColor(selectedCountry.displayGroup, activeTheme)}
                          amount={parsedVisaFeeWithSymbol.amount}
                          currencySymbol={parsedVisaFeeWithSymbol.currencySymbol}
                        />
                      </div>
                    ) : null}
                    {parsedStayDuration ? (
                      <div
                        className={`${styles.officialVisaEntry} ${styles.officialVisaEntryStayDuration}`}
                        aria-label="停留时长图标"
                        title={parsedStayDuration.note || '停留时长'}
                        data-tooltip={parsedStayDuration.note || '停留时长'}
                      >
                        <PassportVisaStayDurationMark
                          className={`${styles.officialVisaEntryIcon} ${styles.officialVisaEntryStayDurationIcon}`}
                          accentColor={themeColor(selectedCountry.displayGroup, activeTheme)}
                          days={parsedStayDuration.days}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.badgeRow}>
                  <div className={styles.detailInfoAnchor}>
                    <button
                      type="button"
                      className={`${styles.badge} ${styles.badgeButton}`}
                      style={{ background: themeColor(selectedCountry.displayGroup, activeTheme), color: '#fff' }}
                      aria-label="查看入境居留信息"
                      {...getDetailInfoInteractiveProps('entry-residence', { badge: true })}
                    >
                      {selectedCountry.rawLabel || getPassportVisaDisplayGroupLabel(selectedCountry.displayGroup)}
                    </button>
                  </div>
                  {shouldRenderPassportVisaRiskBadge(selectedCountry.riskLevel) ? (
                    <div className={styles.detailInfoAnchor}>
                      <button
                        type="button"
                        className={`${styles.badge} ${styles.badgeButton} ${styles.badgeRisk} ${riskBadgeToneClassNameByLevel[getPassportVisaRiskBadgeClassName(selectedCountry.riskLevel)]}`}
                        aria-label={`查看旅行风险等级和安全提醒：${selectedCountry.riskLevel}`}
                        {...getDetailInfoInteractiveProps('travel-risk', { badge: true })}
                      >
                        {selectedCountry.riskLevel}
                      </button>
                    </div>
                  ) : null}
                  {shouldRenderPassportVisaReligiousLawBadge(selectedCountry.religiousLawRestrictions) ? (
                    <div className={styles.detailInfoAnchor}>
                      <button
                        type="button"
                        className={`${styles.badge} ${styles.badgeButton} ${styles.badgeReligiousLaw}`}
                        aria-label="查看教法约束信息"
                        {...getDetailInfoInteractiveProps('religious-law-restrictions', { badge: true })}
                      >
                        教法约束
                      </button>
                    </div>
                  ) : null}
                </div>

                <section className={`${styles.section} ${styles.sectionStay}`}>
                  <p className={styles.sectionLabel}>停留/有效信息</p>
                  <p className={styles.sectionValue}>{selectedCountry.stayDuration || '未提供'}</p>
                </section>

                <section className={`${styles.section} ${styles.sectionVisaFee}`}>
                  <p className={styles.sectionLabel}>签证费</p>
                  <p className={styles.sectionValue}>{selectedCountry.visaFee || '未提供'}</p>
                </section>
              </div>

              {previewDetailInfoContent && previewPanelLayout && !expandedDetailInfoState ? (
                <section
                  style={{
                    width: previewPanelLayout.width,
                    left: previewPanelLayout.left,
                    top: previewPanelLayout.top,
                    ['--detail-info-preview-max-height' as string]: previewPanelMaxHeight
                      ? `${previewPanelMaxHeight}px`
                      : undefined,
                    ['--tooltip-arrow-left' as string]: `${previewPanelLayout.arrowLeft}px`,
                  } as CSSProperties}
                  className={`${styles.detailInfoPanel} ${
                    previewPanelLayout.kind === 'icon'
                      ? styles.detailInfoPanelIcon
                      : styles.detailInfoPanelBadge
                  }`}
                  role="status"
                >
                  <p className={styles.detailInfoTooltipTitle}>{previewDetailInfoContent.title}</p>
                  <p className={styles.detailInfoTooltipBody}>{previewDetailInfoContent.body}</p>
                </section>
              ) : null}

              {expandedDetailInfoContent && expandedPanelLayout ? (
                <section
                  style={{
                    width: expandedPanelLayout.width,
                    left: expandedPanelLayout.left,
                    top: expandedPanelLayout.top,
                    ['--detail-info-expanded-max-height' as string]: expandedPanelMaxHeight
                      ? `${expandedPanelMaxHeight}px`
                      : undefined,
                    ['--tooltip-arrow-left' as string]: `${expandedPanelLayout.arrowLeft}px`,
                  } as CSSProperties}
                  className={`${styles.detailInfoPanel} ${styles.detailInfoPanelExpanded} ${
                    expandedPanelLayout.kind === 'icon'
                      ? styles.detailInfoPanelIcon
                      : styles.detailInfoPanelBadge
                  }`}
                  role="dialog"
                  onMouseLeave={() => setExpandedDetailInfoState(null)}
                >
                  <p className={styles.detailInfoTooltipTitle}>{expandedDetailInfoContent.title}</p>
                  <p className={styles.detailInfoTooltipBody}>{expandedDetailInfoContent.body}</p>
                </section>
              ) : null}
            </div>
          </>
        ) : null}
      </section>

      <section className={styles.bottomDock}>
        <div className={styles.searchBlock}>
          <p className={styles.dockLabel}>Search</p>
          <div className={styles.searchFrame}>
            <input
              className={styles.searchInput}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.bottomTitle}>中国护照签证地图</div>
      </section>
    </main>
  );
}
