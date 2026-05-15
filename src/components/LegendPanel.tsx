'use client';

import { useState } from 'react';
import styles from './LegendPanel.module.css';

const PRESET_COLORS = [
  '#0f172a', '#1e293b', '#334155', '#475569', '#64748b',
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#78716c', '#000000',
];

export interface LineStyle {
  color: string;
  width: number;
  dashed: boolean;
}

interface Props {
  showLines: boolean;
  showPhotos: boolean;
  showLabels: boolean;
  showPoiLabels: boolean;
  poiLabelColor: string;
  markerColor: string;
  markerShape: string;
  showTitle: boolean;
  backgroundColor: string;
  lineStyle: LineStyle;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  onShowLinesChange: (v: boolean) => void;
  onShowPhotosChange: (v: boolean) => void;
  onShowLabelsChange: (v: boolean) => void;
  onShowPoiLabelsChange: (v: boolean) => void;
  onPoiLabelColorChange: (v: string) => void;
  onMarkerColorChange: (v: string) => void;
  onMarkerShapeChange: (v: string) => void;
  onShowTitleChange: (v: boolean) => void;
  onBackgroundColorChange: (v: string) => void;
  onLineStyleChange: (s: LineStyle) => void;
}

export default function LegendPanel({
  showLines,
  showPhotos,
  showLabels,
  showPoiLabels,
  poiLabelColor,
  markerColor,
  markerShape,
  showTitle,
  backgroundColor,
  lineStyle,
  collapsed,
  onCollapsedChange,
  onShowLinesChange,
  onShowPhotosChange,
  onShowLabelsChange,
  onShowPoiLabelsChange,
  onPoiLabelColorChange,
  onMarkerColorChange,
  onMarkerShapeChange,
  onShowTitleChange,
  onBackgroundColorChange,
  onLineStyleChange,
}: Props) {
  const [displayExpanded, setDisplayExpanded] = useState(false);
  const [styleExpanded, setStyleExpanded] = useState(false);
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [poiLabelPickerOpen, setPoiLabelPickerOpen] = useState(false);
  const [markerPickerOpen, setMarkerPickerOpen] = useState(false);

  return (
    <div
      className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}
      style={{ background: collapsed ? undefined : backgroundColor ? `${backgroundColor}eb` : undefined }}
    >
      <button className={styles.toggle} onClick={() => onCollapsedChange(!collapsed)}>
        {collapsed ? '◀' : '▶'} 设置
      </button>

      {!collapsed && (
        <div className={styles.body}>

          {/* === 显示开关 === */}
          <button className={styles.sectionToggle} onClick={() => { setDisplayExpanded(!displayExpanded); setStyleExpanded(false); }}>
            <span className={styles.sectionArrow}>{displayExpanded ? '▾' : '▸'}</span>
            显示开关
          </button>
          {displayExpanded && (
            <div className={styles.sectionBody}>
              <label className={styles.row}>
                <input type="checkbox" checked={showTitle} onChange={e => onShowTitleChange(e.target.checked)} />
                <span className={styles.dot} style={{ background: '#e2e8f0' }} />
                显示标题
              </label>
              <label className={styles.row}>
                <input type="checkbox" checked={showPhotos}
                  onChange={e => { const v = e.target.checked; onShowPhotosChange(v); if (!v) onShowLinesChange(false); }} />
                <span className={styles.dot} style={{ background: '#a5b4fc' }} />
                显示照片
              </label>
              <label className={`${styles.row} ${!showPhotos ? styles.rowDisabled : ''}`}>
                <input type="checkbox" checked={showLabels} disabled={!showPhotos} onChange={e => onShowLabelsChange(e.target.checked)} />
                <span className={styles.dot} style={{ background: '#94a3b8' }} />
                显示文字
              </label>
              <label className={`${styles.row} ${!showLines ? styles.rowDisabled : ''}`}>
                <input type="checkbox" checked={showPoiLabels} disabled={!showLines} onChange={e => onShowPoiLabelsChange(e.target.checked)} />
                <span className={styles.dot} style={{ background: lineStyle.color, opacity: 0.8 }} />
                地图标签
              </label>
              <label className={`${styles.row} ${!showPhotos ? styles.rowDisabled : ''}`}>
                <input type="checkbox" checked={showLines} disabled={!showPhotos} onChange={e => onShowLinesChange(e.target.checked)} />
                <span className={styles.dot} style={{ background: showPhotos ? lineStyle.color : '#374151', opacity: 0.8 }} />
                显示连线
              </label>
            </div>
          )}

          {/* === 样式设置 === */}
          <button className={styles.sectionToggle} onClick={() => { setStyleExpanded(!styleExpanded); setDisplayExpanded(false); }}>
            <span className={styles.sectionArrow}>{styleExpanded ? '▾' : '▸'}</span>
            样式设置
          </button>
          {styleExpanded && (
            <div className={styles.sectionBody}>
              {/* Background */}
              <div className={styles.rowLabel}>背景色</div>
              <div className={styles.colorRow}>
                <button className={styles.colorSwatch} style={{ background: backgroundColor }}
                  onClick={() => { setBgPickerOpen(!bgPickerOpen); setLinePickerOpen(false); setPoiLabelPickerOpen(false); setMarkerPickerOpen(false); }} />
                {bgPickerOpen && (
                  <div className={styles.colorGridOverlay} onClick={() => setBgPickerOpen(false)}>
                    <div className={styles.colorGridPopup} onClick={e => e.stopPropagation()}>
                      {PRESET_COLORS.map(c => (
                        <button key={c} className={`${styles.colorOption} ${backgroundColor === c ? styles.colorActive : ''}`} style={{ background: c }}
                          onClick={() => { onBackgroundColorChange(c); setBgPickerOpen(false); }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* POI label color */}
              {showPoiLabels && showLines && (
                <>
                  <div className={styles.rowLabel}>标签颜色</div>
                  <div className={styles.colorRow}>
                    <button className={styles.colorSwatch} style={{ background: poiLabelColor }}
                      onClick={() => { setPoiLabelPickerOpen(!poiLabelPickerOpen); setBgPickerOpen(false); setLinePickerOpen(false); setMarkerPickerOpen(false); }} />
                    {poiLabelPickerOpen && (
                      <div className={styles.colorGridOverlay} onClick={() => setPoiLabelPickerOpen(false)}>
                        <div className={styles.colorGridPopup} onClick={e => e.stopPropagation()}>
                          {PRESET_COLORS.map(c => (
                            <button key={c} className={`${styles.colorOption} ${poiLabelColor === c ? styles.colorActive : ''}`} style={{ background: c }}
                              onClick={() => { onPoiLabelColorChange(c); setPoiLabelPickerOpen(false); }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Marker style */}
              <div className={styles.sectionTitle}>标注点样式</div>
              <div className={styles.rowLabel}>颜色</div>
              <div className={styles.colorRow}>
                <button className={styles.colorSwatch} style={{ background: markerColor }}
                  onClick={() => { setMarkerPickerOpen(!markerPickerOpen); setBgPickerOpen(false); setLinePickerOpen(false); setPoiLabelPickerOpen(false); }} />
                {markerPickerOpen && (
                  <div className={styles.colorGridOverlay} onClick={() => setMarkerPickerOpen(false)}>
                    <div className={styles.colorGridPopup} onClick={e => e.stopPropagation()}>
                      {PRESET_COLORS.map(c => (
                        <button key={c} className={`${styles.colorOption} ${markerColor === c ? styles.colorActive : ''}`} style={{ background: c }}
                          onClick={() => { onMarkerColorChange(c); setMarkerPickerOpen(false); }} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.rowLabel}>形状</div>
              <div className={styles.shapeRow}>
                {(['pin', 'dot', 'diamond'] as const).map(s => (
                  <button key={s} className={`${styles.shapeBtn} ${markerShape === s ? styles.shapeActive : ''}`}
                    onClick={() => onMarkerShapeChange(s)}>
                    {s === 'pin' ? '图钉' : s === 'dot' ? '圆点' : '菱形'}
                  </button>
                ))}
              </div>

              {/* Line style */}
              {showLines && showPhotos && (
                <>
                  <div className={styles.sectionTitle}>连线样式</div>
                  <div className={styles.rowLabel}>颜色</div>
                  <div className={styles.colorRow}>
                    <button className={styles.colorSwatch} style={{ background: lineStyle.color }}
                      onClick={() => { setLinePickerOpen(!linePickerOpen); setBgPickerOpen(false); setPoiLabelPickerOpen(false); setMarkerPickerOpen(false); }} />
                    {linePickerOpen && (
                      <div className={styles.colorGridOverlay} onClick={() => setLinePickerOpen(false)}>
                        <div className={styles.colorGridPopup} onClick={e => e.stopPropagation()}>
                          {PRESET_COLORS.map(c => (
                            <button key={c} className={`${styles.colorOption} ${lineStyle.color === c ? styles.colorActive : ''}`} style={{ background: c }}
                              onClick={() => { onLineStyleChange({ ...lineStyle, color: c }); setLinePickerOpen(false); }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={styles.rowLabel}>粗细 <span className={styles.value}>{lineStyle.width}px</span></div>
                  <input type="range" min="1" max="8" step="0.5" value={lineStyle.width}
                    onChange={e => onLineStyleChange({ ...lineStyle, width: Number(e.target.value) })} className={styles.slider} />
                  <label className={styles.row}>
                    <input type="checkbox" checked={lineStyle.dashed} onChange={e => onLineStyleChange({ ...lineStyle, dashed: e.target.checked })} />
                    虚线
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
