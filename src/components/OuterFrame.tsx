'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useOuterFrame } from '@/hooks/useOuterFrame';
import { CLAMP_SCALE, logicalViewport, type Viewport } from '@/lib/outerFrameCoords';
import OuterFrameCanvas from './OuterFrameCanvas';
import type { DraggedGroupPhotoPosition, PhotoItem, PoiPoint } from './OuterFrameCanvas';
import type { LineStyle } from './LegendPanel';
import type { MapMarker } from './PlanMap';
import PlanMap from './PlanMap';
import { buildGroupGeometryFromLayout, type GroupLayoutSnapshot } from './localMapGroupGeometry';
import { getFootprintMapRect } from './footprintMapGeometry';

const PHOTO_MAX_EDGE = 120;
const PHOTO_MIN_EDGE = 48;
const FIT_VIEW_PADDING = 24;
const VIEWPORT_PADDING_LOGICAL = 24;
const MAP_AREA_RATIO_W = 0.6;
const MAP_AREA_RATIO_H = 0.8;
const FIT_VIEW_ITERATION_COUNT = 4;

export function buildViewportFromRects(
  rects: Array<{ left: number; right: number; top: number; bottom: number }>,
  padding = VIEWPORT_PADDING_LOGICAL,
): Viewport | null {
  if (rects.length === 0) return null;

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const rect of rects) {
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }

  return {
    left: left - padding,
    right: right + padding,
    top: top - padding,
    bottom: bottom + padding,
  };
}

type FitViewMetrics = {
  photoLeft: number;
  photoRight: number;
  photoTop: number;
  photoBottom: number;
  leftOverflowScreen: number;
  rightOverflowScreen: number;
  topOverflowScreen: number;
  bottomOverflowScreen: number;
};

interface Props {
  markers: MapMarker[];
  photos: PhotoItem[];
  groupLayouts?: GroupLayoutSnapshot[];
  onPoiPointsChange?: (points: PoiPoint[]) => void;
  focusPosition?: [number, number] | null;
  onMarkerClick?: (marker: MapMarker) => void;
  onPhotoDragEnd?: (photoId: number | string, x: number, y: number) => void;
  onPhotoClick?: (photoId: number | string) => void;
  onGroupLabelDragEnd?: (placeKey: string, nextGroupPhotos: DraggedGroupPhotoPosition[]) => void;
  mapRef?: React.MutableRefObject<unknown>;
  showPhotos: boolean;
  showLines: boolean;
  showLabels: boolean;
  showPoiLabels: boolean;
  poiLabelColor: string;
  markerColor: string;
  markerShape: string;
  backgroundColor: string;
  lineStyle: LineStyle;
  onScaleChange?: (scale: number) => void;
  onViewportChange?: (viewport: Viewport) => void;
  fitViewKey?: string | number;
  fitViewEnabled?: boolean;
  baseMinScale?: number;
}

export default function OuterFrame({
  markers,
  photos,
  groupLayouts,
  onPoiPointsChange,
  focusPosition,
  onMarkerClick,
  onPhotoDragEnd,
  onPhotoClick,
  onGroupLabelDragEnd,
  mapRef,
  showPhotos,
  showLines,
  showLabels,
  showPoiLabels,
  poiLabelColor,
  markerColor,
  markerShape,
  backgroundColor,
  lineStyle,
  onScaleChange,
  onViewportChange,
  fitViewKey,
  fitViewEnabled = false,
  baseMinScale = 1,
}: Props) {
  const [minScale, setMinScale] = useState(baseMinScale);
  const {
    transform,
    setTransform,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useOuterFrame({ initialScale: 1, minScale });

  const [mapReady, setMapReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Measure container + pass to useOuterFrame
  const roRef = useRef<ResizeObserver | null>(null);
  const setContainerEl = useCallback((el: HTMLDivElement | null) => {
    // Pass to useOuterFrame
    containerRef(el);
    // ResizeObserver
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (el) {
      roRef.current = new ResizeObserver(([entry]) => {
        setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      });
      roRef.current.observe(el);
    }
  }, [containerRef]);

  const handleMapReady = useCallback((map: unknown) => {
    mapInstanceRef.current = map;
    if (mapRef) mapRef.current = map;
    setMapReady(true);
  }, [mapRef]);

  // --- POI coordinate conversion ---
  const [poiPoints, setPoiPoints] = useState<PoiPoint[]>([]);

  const getPhotoLogicalSize = useCallback((photo: Pick<PhotoItem, 'pixelWidth' | 'pixelHeight'>) => {
    const sourceWidth = photo.pixelWidth ?? 0;
    const sourceHeight = photo.pixelHeight ?? 0;
    if (sourceWidth > 0 && sourceHeight > 0) {
      if (sourceWidth >= sourceHeight) {
        return {
          width: PHOTO_MAX_EDGE,
          height: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * sourceHeight) / sourceWidth),
        };
      }
      return {
        width: Math.max(PHOTO_MIN_EDGE, (PHOTO_MAX_EDGE * sourceWidth) / sourceHeight),
        height: PHOTO_MAX_EDGE,
      };
    }
    return { width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE };
  }, []);

  const getMapLogicalBounds = useCallback(() => ({
    halfW: (containerSize.w * MAP_AREA_RATIO_W) / 2,
    halfH: (containerSize.h * MAP_AREA_RATIO_H) / 2,
  }), [containerSize]);

  const buildPhotoGroupFitMetrics = useCallback((geometryScale: number): FitViewMetrics | null => {
    const groups = new Map<string, PhotoItem[]>();
    for (const photo of photos) {
      if (photo.frameX == null || photo.frameY == null) continue;
      const group = groups.get(photo.placeKey) || [];
      group.push(photo);
      groups.set(photo.placeKey, group);
    }
    if (groups.size === 0) return null;

    let photoLeft = Infinity;
    let photoRight = -Infinity;
    let photoTop = Infinity;
    let photoBottom = -Infinity;
    let leftOverflowScreen = 0;
    let rightOverflowScreen = 0;
    let topOverflowScreen = 0;
    let bottomOverflowScreen = 0;

    for (const [, groupPhotos] of groups) {
      const geometry = buildGroupGeometryFromLayout(
        groupPhotos[0]?.placeKey || '',
        groupPhotos,
        getPhotoLogicalSize,
        geometryScale,
        groupLayouts ?? [],
        getFootprintMapRect(containerSize.w || 1200, containerSize.h || 800),
      );
      if (!geometry) continue;
      photoLeft = Math.min(photoLeft, geometry.photoRect.left);
      photoRight = Math.max(photoRight, geometry.photoRect.right);
      photoTop = Math.min(photoTop, geometry.photoRect.top);
      photoBottom = Math.max(photoBottom, geometry.photoRect.bottom);
      leftOverflowScreen = Math.max(leftOverflowScreen, geometry.photoRect.left - geometry.overallRect.left);
      rightOverflowScreen = Math.max(rightOverflowScreen, geometry.overallRect.right - geometry.photoRect.right);
      topOverflowScreen = Math.max(topOverflowScreen, geometry.photoRect.top - geometry.overallRect.top);
      bottomOverflowScreen = Math.max(bottomOverflowScreen, geometry.overallRect.bottom - geometry.photoRect.bottom);
    }

    if (
      !Number.isFinite(photoLeft) ||
      !Number.isFinite(photoRight) ||
      !Number.isFinite(photoTop) ||
      !Number.isFinite(photoBottom)
    ) {
      return null;
    }

    return {
      photoLeft,
      photoRight,
      photoTop,
      photoBottom,
      leftOverflowScreen,
      rightOverflowScreen,
      topOverflowScreen,
      bottomOverflowScreen,
    };
  }, [photos, getPhotoLogicalSize, groupLayouts, containerSize]);

  const computePoiPoints = useCallback(() => {
    const map = mapInstanceRef.current;
    const mapEl = mapContainerRef.current;
    if (!map || !mapEl) return;

    const mapRect = mapEl.getBoundingClientRect();
    if (mapRect.width === 0 || mapRect.height === 0) return;

    const amapContainer = map.getContainer();
    const amapWidth = amapContainer?.offsetWidth || mapRect.width;
    const amapHeight = amapContainer?.offsetHeight || mapRect.height;
    const { halfW, halfH } = getMapLogicalBounds();
    if (halfW <= 0 || halfH <= 0) return;

    const points: PoiPoint[] = [];
    for (const m of markers) {
      try {
        const pos = map.lngLatToContainer([m.position[0], m.position[1]]);
        const normalizedX = amapWidth > 0 ? pos.x / amapWidth : 0.5;
        const normalizedY = amapHeight > 0 ? pos.y / amapHeight : 0.5;
        const logicalX = (normalizedX - 0.5) * halfW * 2;
        const logicalY = (normalizedY - 0.5) * halfH * 2;

        points.push({
          placeKey: m.id ? String(m.id) : m.title || '',
          placeTitle: m.title || '',
          logicalX,
          logicalY,
        });
      } catch { /* skip marker with invalid coordinates */ }
    }
    setPoiPoints(points);
  }, [markers, getMapLogicalBounds]);

  // Report scale changes
  useEffect(() => {
    onScaleChange?.(transform.scale);
  }, [transform.scale, onScaleChange]);

  useEffect(() => {
    if (!containerSize.w || !containerSize.h) return;
    onViewportChange?.(logicalViewport(containerSize.w, containerSize.h, transform));
  }, [containerSize, transform, onViewportChange]);

  useEffect(() => {
    setMinScale(baseMinScale);
    setTransform((current) => {
      if (current.scale >= baseMinScale) return current;
      return {
        ...current,
        scale: baseMinScale,
      };
    });
  }, [baseMinScale, setTransform]);

  useEffect(() => {
    if (!fitViewEnabled || fitViewKey == null || !containerSize.w || !containerSize.h) return;
    let nextScale = Math.min(CLAMP_SCALE.max, Math.max(baseMinScale, transform.scale || 1));
    let metrics: FitViewMetrics | null = null;

    for (let index = 0; index < FIT_VIEW_ITERATION_COUNT; index++) {
      metrics = buildPhotoGroupFitMetrics(nextScale);
      if (!metrics) return;

      const photoWidth = Math.max(1, metrics.photoRight - metrics.photoLeft);
      const photoHeight = Math.max(1, metrics.photoBottom - metrics.photoTop);
      const availableWidth = Math.max(
        1,
        containerSize.w - FIT_VIEW_PADDING * 2 - metrics.leftOverflowScreen - metrics.rightOverflowScreen,
      );
      const availableHeight = Math.max(
        1,
        containerSize.h - FIT_VIEW_PADDING * 2 - metrics.topOverflowScreen - metrics.bottomOverflowScreen,
      );
      const fittedScale = Math.min(
        CLAMP_SCALE.max,
        Math.min(availableWidth / photoWidth, availableHeight / photoHeight),
      );
      if (Math.abs(fittedScale - nextScale) < 0.005) {
        nextScale = fittedScale;
        break;
      }
      nextScale = fittedScale;
    }

    metrics = buildPhotoGroupFitMetrics(nextScale);
    if (!metrics) return;

    const viewportLeft = metrics.photoLeft - (FIT_VIEW_PADDING + metrics.leftOverflowScreen) / nextScale;
    const viewportRight = metrics.photoRight + (FIT_VIEW_PADDING + metrics.rightOverflowScreen) / nextScale;
    const viewportTop = metrics.photoTop - (FIT_VIEW_PADDING + metrics.topOverflowScreen) / nextScale;
    const viewportBottom = metrics.photoBottom + (FIT_VIEW_PADDING + metrics.bottomOverflowScreen) / nextScale;
    const centerX = (viewportLeft + viewportRight) / 2;
    const centerY = (viewportTop + viewportBottom) / 2;

    setMinScale(nextScale);
    setTransform({
      scale: nextScale,
      tx: -centerX * nextScale,
      ty: -centerY * nextScale,
    });
  }, [fitViewEnabled, fitViewKey, containerSize, buildPhotoGroupFitMetrics, setTransform, baseMinScale, transform.scale]);
  useEffect(() => {
    if (!mapReady) return;
    computePoiPoints();

    const map = mapInstanceRef.current as {
      on?: (eventName: string, handler: () => void) => void;
      off?: (eventName: string, handler: () => void) => void;
    } | null;
    if (!map?.on || !map?.off) return;

    const events = ['moveend', 'zoomend', 'resize', 'complete'];
    events.forEach((eventName) => map.on?.(eventName, computePoiPoints));
    return () => {
      events.forEach((eventName) => map.off?.(eventName, computePoiPoints));
    };
  }, [mapReady, computePoiPoints]);

  useEffect(() => {
    onPoiPointsChange?.(poiPoints);
  }, [poiPoints, onPoiPointsChange]);

  return (
    <div
      ref={setContainerEl}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: backgroundColor,
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Map (z:1, bottom) */}
      <div
        ref={mapContainerRef}
        data-no-pan
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: `${60}%`,
          height: `${80}%`,
          transform: `translate(-50%, -50%) scale(${transform.scale}) translate(${transform.tx / transform.scale}px, ${transform.ty / transform.scale}px)`,
          transformOrigin: 'center center',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 0 40px rgba(0,0,0,0.5)',
          zIndex: 1,
        }}
      >
        <PlanMap
          markers={markers}
          focusPosition={focusPosition}
          onMarkerClick={onMarkerClick}
          onMapLoad={handleMapReady}
          autoLoadMarkers={false}
          markerColor={markerColor}
          markerShape={markerShape}
        />
      </div>

      {/* Photos / lines / labels (z:3, top) */}
      {showPhotos && (
        <OuterFrameCanvas
          width={containerSize.w || 1200}
          height={containerSize.h || 800}
          transform={transform}
          photos={photos}
          groupLayouts={groupLayouts}
          scale={transform.scale}
          poiPoints={poiPoints}
          showLines={showLines}
          lineStyle={lineStyle}
          showLabels={showLabels}
          showPoiLabels={showPoiLabels}
          poiLabelColor={poiLabelColor}
          renderVersion={fitViewKey}
          onPhotoDragEnd={onPhotoDragEnd}
          onPhotoClick={onPhotoClick}
          onGroupLabelDragEnd={onGroupLabelDragEnd}
        />
      )}
    </div>
  );
}
