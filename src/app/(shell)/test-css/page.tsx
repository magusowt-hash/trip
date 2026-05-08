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

  const safeMarginX = safeW / 2 + BUBBLE_REAL_W / 2;
  const safeMarginY = safeH / 2 + BUBBLE_REAL_H / 2;
  const CELL_W = BUBBLE_REAL_W;
  const CELL_H = BUBBLE_REAL_H;
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

  const totalCells = gridCells.filter(g => !g.gap && !g.safe).length;
  const usedCells = bubbles.length;
  const canFit = totalCells - usedCells;

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h1>CSS 气泡布局测试</h1>
      
      <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>区域宽: <input type="number" value={w} onChange={e => setW(+e.target.value)} style={{ width: 60 }} /></label>
        <label>区域高: <input type="number" value={h} onChange={e => setH(+e.target.value)} style={{ width: 60 }} /></label>
        <label>安全区宽: <input type="number" value={safeW} onChange={e => setSafeW(+e.target.value)} style={{ width: 60 }} /></label>
        <label>安全区高: <input type="number" value={safeH} onChange={e => setSafeH(+e.target.value)} style={{ width: 60 }} /></label>
        <label>边距: <input type="number" value={pad} onChange={e => setPad(+e.target.value)} style={{ width: 60 }} /></label>
        <label><input type="checkbox" checked={gapEnabled} onChange={e => setGapEnabled(e.target.checked)} /> 间隙模式</label>
      </div>

      <div style={{ marginBottom: 10, fontSize: 14 }}>
        <strong>网格:</strong> {cols}列 × {rows}行 = {cols * rows} 格 | 
        <strong> 可用:</strong> {totalCells} | 
        <strong> 已放:</strong> {usedCells} | 
        <strong> 可继续:</strong> {canFit}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={addBubble} style={{ padding: '8px 20px', background: '#007aff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>添加气泡</button>
        <button onClick={clearBubbles} style={{ padding: '8px 20px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>清空</button>
        <button onClick={() => setBubbles([])} style={{ padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>填满所有</button>
      </div>

      <div style={{ position: 'relative', width: w, height: h, background: '#fafafa', border: '2px solid #333', borderRadius: 8, overflow: 'hidden' }}>
        {gridCells.map((cell, i) => {
          const hasBubble = bubbles.some(b => Math.abs(b.x - cell.x) < CELL_W / 2 && Math.abs(b.y - cell.y) < CELL_H / 2);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: cell.x - CELL_W / 2,
                top: cell.y - CELL_H / 2,
                width: CELL_W,
                height: CELL_H,
                background: hasBubble ? 'transparent' : cell.safe ? 'rgba(255,0,0,0.15)' : cell.gap ? 'rgba(0,0,0,0.08)' : 'rgba(0,0,0,0.05)',
                border: cell.safe ? '1px dashed rgba(255,0,0,0.5)' : cell.gap ? '1px dashed rgba(0,0,0,0.2)' : '1px solid rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                color: '#666',
              }}
            />
          );
        })}

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
              fontSize: 13,
              fontWeight: 600,
              color: '#1d1d1f',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            }}
          >
            <div>¥{bubble.amount.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 15, fontSize: 12, color: '#666' }}>
        <p>气泡尺寸: {BUBBLE_W}×{BUBBLE_H} (内容) / {BUBBLE_REAL_W}×{BUBBLE_REAL_H} (视觉含 padding)</p>
        <p>格尺寸: {CELL_W}×{CELL_H} (正好容纳一个气泡内容)</p>
        <p>间隙: ±{GAP}px 随机偏移</p>
      </div>
    </div>
  );
}