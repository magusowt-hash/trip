'use client';

import { useRef, useCallback, useState, useEffect } from 'react';
import { useOuterFrame } from '@/hooks/useOuterFrame';
import { logicalViewport, type Viewport } from '@/lib/outerFrameCoords';
import OuterFrameCanvas from './OuterFrameCanvas';
import LineCanvas from './LineCanvas';
import type { PhotoItem, PoiPoint } from './OuterFrameCanvas';
import type { LineStyle } from './LegendPanel';
import type { MapMarker } from './PlanMap';
import PlanMap from './PlanMap';

const GROUP_VIEWPORT_PADDING = 120;

interface Props {
  markers: MapMarker[];
  photos: PhotoItem[];
  onPoiPointsChange?: (points: PoiPoint[]) => void;
  focusPosition?: [number, number] | null;
  onMarkerClick?: (marker: MapMarker) => void;
  onPhotoDragEnd?: (photoId: number | string, x: number, y: number) => void;
  onPhotoClick?: (photoId: number | string) => void;
  onPhotoMoved?: () => void;
  onGroupLabelDragEnd?: (placeKey: string, dx: number, dy: number) => void;
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
}

export default function OuterFrame({
  markers,
  photos,
  onPoiPointsChange,
  focusPosition,
  onMarkerClick,
  onPhotoDragEnd,
  onPhotoClick,
  onPhotoMoved,
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
}: Props) {
  const {
    transform,
    containerRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useOuterFrame({ initialScale: 1 });

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

  const buildPhotoGroupViewport = useCallback((): Viewport | null => {
    const placedPhotos = photos.filter((photo) => photo.frameX != null && photo.frameY != null);
    if (placedPhotos.length === 0) return null;

    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;

    for (const photo of placedPhotos) {
      const sourceWidth = photo.pixelWidth ?? 0;
      const sourceHeight = photo.pixelHeight ?? 0;
      let logicalWidth = 120;
      let logicalHeight = 120;

      if (sourceWidth > 0 && sourceHeight > 0) {
        if (sourceWidth >= sourceHeight) {
          logicalWidth = 120;
          logicalHeight = Math.max(48, (120 * sourceHeight) / sourceWidth);
        } else {
          logicalWidth = Math.max(48, (120 * sourceWidth) / sourceHeight);
          logicalHeight = 120;
        }
      }

      left = Math.min(left, (photo.frameX ?? 0) - logicalWidth / 2);
      right = Math.max(right, (photo.frameX ?? 0) + logicalWidth / 2);
      top = Math.min(top, (photo.frameY ?? 0) - logicalHeight / 2);
      bottom = Math.max(bottom, (photo.frameY ?? 0) + logicalHeight / 2);
    }

    if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {
      return null;
    }

    const padding = GROUP_VIEWPORT_PADDING / Math.max(transform.scale, 0.1);
    return {
      left: left - padding,
      right: right + padding,
      top: top - padding,
      bottom: bottom + padding,
    };
  }, [photos, transform.scale]);

  const computePoiPoints = useCallback(() => {
    const map = mapInstanceRef.current;
    const mapEl = mapContainerRef.current;
    if (!map || !mapEl) return;

    const mapRect = mapEl.getBoundingClientRect();
    if (mapRect.width === 0 || mapRect.height === 0) return;

    const amapContainer = map.getContainer();
    const amapWidth = amapContainer?.offsetWidth || mapRect.width;
    const amapHeight = amapContainer?.offsetHeight || mapRect.height;

    const points: PoiPoint[] = [];
    for (const m of markers) {
      try {
        const pos = map.lngLatToContainer([m.position[0], m.position[1]]);
        // Convert AMap container coords → screen coords
        const screenX = mapRect.left + (pos.x / amapWidth) * mapRect.width;
        const screenY = mapRect.top + (pos.y / amapHeight) * mapRect.height;

        // Screen → OuterFrame logical (model: screen = logical*scale + Vw/2 + tx)
        const logicalX = (screenX - containerSize.w / 2 - transform.tx) / transform.scale;
        const logicalY = (screenY - containerSize.h / 2 - transform.ty) / transform.scale;

        points.push({
          placeKey: m.id ? String(m.id) : m.title || '',
          placeTitle: m.title || '',
          logicalX,
          logicalY,
        });
      } catch { /* skip marker with invalid coordinates */ }
    }
    setPoiPoints(points);
  }, [markers, transform, containerSize]);

  // Report scale changes
  useEffect(() => {
    onScaleChange?.(transform.scale);
  }, [transform.scale, onScaleChange]);

  useEffect(() => {
    if (!containerSize.w || !containerSize.h) return;
    const viewport = logicalViewport(containerSize.w, containerSize.h, transform);
    const groupViewport = buildPhotoGroupViewport();
    onViewportChange?.(groupViewport ? {
      left: Math.min(viewport.left, groupViewport.left),
      top: Math.min(viewport.top, groupViewport.top),
      right: Math.max(viewport.right, groupViewport.right),
      bottom: Math.max(viewport.bottom, groupViewport.bottom),
    } : viewport);
  }, [containerSize, transform, onViewportChange, buildPhotoGroupViewport]);
  useEffect(() => {
    if (!mapReady) return;
    let rafId: number;
    const loop = () => {
      computePoiPoints();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
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

      {/* Lines (z:2, between map and photos) */}
      {showLines && (
        <LineCanvas
          width={containerSize.w || 1200}
          height={containerSize.h || 800}
          transform={transform}
          photos={photos}
          poiPoints={poiPoints}
          lineStyle={lineStyle}
          showPoiLabels={showPoiLabels}
          poiLabelColor={poiLabelColor}
        />
      )}

      {/* Photos (z:3, top) */}
      {showPhotos && (
        <OuterFrameCanvas
          width={containerSize.w || 1200}
          height={containerSize.h || 800}
          transform={transform}
          photos={photos}
          scale={transform.scale}
          showLabels={showLabels}
          onPhotoDragEnd={onPhotoDragEnd}
          onPhotoClick={onPhotoClick}
          onPhotoMoved={onPhotoMoved}
          onGroupLabelDragEnd={onGroupLabelDragEnd}
        />
      )}
    </div>
  );
}
