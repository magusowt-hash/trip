'use client';

import { useState, useRef, useEffect } from 'react';

const BUBBLE_W = 62, BUBBLE_H = 46, BUBBLE_REAL_W = 108, BUBBLE_REAL_H = 66, GAP = 6;

interface Bubble {
  id: number;
  x: number;
  y: number;
  name: string;
  amount: number;
  color: string;
}

const COLORS = ['#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#22c55e', '#6b7280'];

export default function TestCssPage() {
  const areaRef = useRef<HTMLDivElement>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [w, setW] = useState(700);
  const [h, setH] = useState(350);
  const [safeW, setSafeW] = useState(260);
  const [safeH, setSafeH] = useState(110);
  const [pad, setPad] = useState(6);
  const [gapEnabled, setGapEnabled] = useState(true);

  const safeMarginX = safeW / 2 + BUBBLE_W / 2;
  const safeMarginY = safeH / 2 + BUBBLE_H / 2;
  const CELL_W = BUBBLE_W + GAP;
  const CELL_H = BUBBLE_H + GAP;
  const cols = Math.floor((w - pad * 2) / CELL_W);
  const rows = Math.floor((h - pad * 2) / CELL_H);
  const areaCx = w / 2, areaCy = h / 2;

  const isGap = (c: number, r: number): boolean => {
    if (!gapEnabled) return false;
    if (c % 4 === 3 || c % 5 === 4) return true;
    if (r % 3 === 2) return true;
    return false;
  };

  const addBubble = () => {
    const existing: Record<number, { x: number; y: number }> = {};
    bubbles.forEach(b => { existing[b.id] = { x: b.x, y: b.y }; });

    const free: { cx: number; cy: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isGap(c, r)) continue;
        const cx = pad + c * CELL_W + CELL_W / 2;
        const cy = pad + r * CELL_H + CELL_H / 2;
        if (Math.abs(cx - areaCx) < safeMarginX && Math.abs(cy - areaCy) < safeMarginY) continue;
        let occupied = false;
        for (const id of Object.keys(existing).map(Number)) {
          const p = existing[id];
          if (!p) continue;
          if (Math.abs(cx - p.x) < CELL_W && Math.abs(cy - p.y) < CELL_H) { occupied = true; break; }
        }
        if (!occupied) free.push({ cx, cy });
      }
    }

    if (free.length === 0) {
      alert('网格已满！');
      return;
    }

    free.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
    const cell = free[0];
    const offX = (Math.random() - 0.5) * GAP;
    const offY = (Math.random() - 0.5) * GAP;
    const newBubble: Bubble = {
      id: Date.now(),
      x: cell.cx + offX,
      y: cell.cy + offY,
      name: COLORS[bubbles.length % COLORS.length],
      amount: Math.floor(Math.random() * 999999) + 1000,
      color: COLORS[bubbles.length % COLORS.length],
    };
    setBubbles([...bubbles, newBubble]);
  };

  const clearBubbles = () => setBubbles([]);

  const gridCells: { x: number; y: number; r: number; c: number; gap: boolean; safe: boolean }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = pad + c * CELL_W + CELL_W / 2;
      const cy = pad + r * CELL_H + CELL_H / 2;
      const inSafeZone = Math.abs(cx - areaCx) < safeMarginX && Math.abs(cy - areaCy) < safeMarginY;
      gridCells.push({ x: cx, y: cy, r, c, gap: isGap(c, r), safe: inSafeZone });
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h1>CSS 气泡布局测试</h1>
      
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
        <label>宽: <input type="number" value={w} onChange={e => setW(+e.target.value)} style={{ width: 60 }} /></label>
        <label>高: <input type="number" value={h} onChange={e => setH(+e.target.value)} style={{ width: 60 }} /></label>
        <label>安全区宽: <input type="number" value={safeW} onChange={e => setSafeW(+e.target.value)} style={{ width: 60 }} /></label>
        <label>安全区高: <input type="number" value={safeH} onChange={e => setSafeH(+e.target.value)} style={{ width: 60 }} /></label>
        <label>边距: <input type="number" value={pad} onChange={e => setPad(+e.target.value)} style={{ width: 60 }} /></label>
        <label><input type="checkbox" checked={gapEnabled} onChange={e => setGapEnabled(e.target.checked)} /> 显示间隙</label>
        <button onClick={addBubble} style={{ padding: '6px 16px', background: '#007aff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>添加气泡</button>
        <button onClick={clearBubbles} style={{ padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>清空</button>
      </div>

      <div style={{ marginBottom: 10 }}>
        网格: {cols}×{rows} = {cols * rows} 格 | 可用: {gridCells.filter(g => !g.gap && !g.safe).length} | 已添加: {bubbles.length}
      </div>

      <div style={{ position: 'relative', width: w, height: h, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
        {gridCells.map((cell, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: cell.x - CELL_W / 2,
              top: cell.y - CELL_H / 2,
              width: CELL_W,
              height: CELL_H,
              background: cell.safe ? 'rgba(255,0,0,0.1)' : cell.gap ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.03)',
              border: cell.safe ? '1px dashed red' : cell.gap ? '1px dashed #999' : '1px solid #eee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 8,
              color: '#999',
            }}
          >
            {cell.c},{cell.r}
          </div>
        ))}

        {bubbles.map(bubble => (
          <div
            key={bubble.id}
            style={{
              position: 'absolute',
              left: bubble.x - BUBBLE_REAL_W / 2,
              top: bubble.y - BUBBLE_REAL_H / 2,
              width: BUBBLE_REAL_W,
              height: BUBBLE_REAL_H,
              border: `2px solid ${bubble.color}`,
              borderRadius: 14,
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 600,
              color: '#1d1d1f',
            }}
          >
            <div>¥{bubble.amount.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}