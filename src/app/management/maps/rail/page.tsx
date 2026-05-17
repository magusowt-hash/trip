'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../../admin-auth';

interface RailSettings {
  localMajorShowZoom: string;
  localMajorFadeStart: string;
  localShowZoom: string;
  localFadeStart: string;
  clusterRZ1: number;
  clusterRZ2: number;
  clusterRZ3: number;
  clusterRZ4: number;
  majorClusterRatio: string;
  dedupZ1: number;
  dedupZ2: number;
  dedupZ3: number;
  dedupZ4: number;
  hubRadius: number;
  majorRadius: number;
  localMajorRadius: string;
  localRadius: number;
  hubColor: string;
  majorColor: string;
  localMajorColor: string;
  localColor: string;
}

interface StationOverride {
  id: number;
  stationName: string;
  displayName: string | null;
  levelOverride: string | null;
  displayLevel: string | null;
}

const DEFAULTS: RailSettings = {
  localMajorShowZoom: '8.0', localMajorFadeStart: '7.0',
  localShowZoom: '9.0', localFadeStart: '8.0',
  clusterRZ1: 40, clusterRZ2: 28, clusterRZ3: 18, clusterRZ4: 10,
  majorClusterRatio: '0.70',
  dedupZ1: 36, dedupZ2: 24, dedupZ3: 16, dedupZ4: 12,
  hubRadius: 5, majorRadius: 4, localMajorRadius: '2.5', localRadius: 2,
  hubColor: '#dc2626', majorColor: '#f59e0b', localMajorColor: '#10b981', localColor: '#9ca3af',
};

const levelLabels: Record<string, string> = {
  hub: '枢纽', major: '地级', local_major: '县级', local: '其他', deleted: '已删除',
};

export default function RailMapManagementPage() {
  const { token } = useAdminAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [tab, setTab] = useState<'settings' | 'stations'>('settings');
  const [settings, setSettings] = useState<RailSettings>({ ...DEFAULTS });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // 站点管理
  const [overrides, setOverrides] = useState<StationOverride[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Partial<StationOverride>>({});
  const [stationsLoading, setStationsLoading] = useState(false);

  // 加载设置
  useEffect(() => {
    fetch('/api/admin/maps/rail/settings', { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setSettings(d.settings);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  // 加载覆盖列表
  const loadOverrides = (q = '') => {
    setStationsLoading(true);
    fetch(`/api/admin/station-overrides?q=${encodeURIComponent(q)}`, { headers })
      .then((r) => r.json())
      .then((d) => setOverrides(d.list || []))
      .finally(() => setStationsLoading(false));
  };

  useEffect(() => {
    if (tab === 'stations') loadOverrides(searchQ);
  }, [tab]);

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/admin/maps/rail/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.settings) setMsg('✅ 设置已保存');
      else setMsg('❌ 保存失败');
    } catch {
      setMsg('❌ 网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings({ ...DEFAULTS });
  };

  const openEdit = (item?: StationOverride) => {
    setEditItem(item ? { ...item } : { stationName: '', displayName: '', levelOverride: '', displayLevel: '' });
    setShowModal(true);
  };

  const handleOverrideSave = async () => {
    if (!editItem.stationName?.trim()) return;
    try {
      const res = await fetch('/api/admin/station-overrides', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(editItem),
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        loadOverrides(searchQ);
        setMsg('✅ 覆盖已保存');
      }
    } catch { setMsg('❌ 保存失败'); }
  };

  const handleOverrideDelete = async (name: string) => {
    if (!confirm(`确定删除「${name}」的覆盖记录？`)) return;
    try {
      await fetch(`/api/admin/station-overrides/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers,
      });
      loadOverrides(searchQ);
      setMsg('✅ 已删除');
    } catch { setMsg('❌ 删除失败'); }
  };

  // ─── helpers ──────────────────────────────────
  const input = (label: string, value: string | number, onChange: (v: string) => void, type = 'text', step?: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 130, color: '#374151' }}>{label}</span>
      <input
        type={type}
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 80, padding: '4px 8px', border: '1px solid #d1d5db',
          borderRadius: 4, fontSize: 13,
        }}
      />
    </label>
  );

  const colorInput = (label: string, value: string, onChange: (v: string) => void) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ minWidth: 130, color: '#374151' }}>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }}
      />
      <code style={{ fontSize: 12, color: '#6b7280' }}>{value}</code>
    </label>
  );

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>加载中...</div>;
  }

  // ─── Render ──────────────────────────────────
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', color: '#1f2937' }}>中国铁路地图管理</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {[
          ['settings', '显示设置'],
          ['stations', '站点管理'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            style={{
              padding: '8px 20px', border: 'none', background: 'none',
              fontSize: 14, fontWeight: tab === k ? 600 : 400,
              color: tab === k ? '#2563eb' : '#6b7280',
              borderBottom: tab === k ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{
          padding: '8px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13,
          background: msg.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
          color: msg.startsWith('✅') ? '#065f46' : '#991b1b',
        }}>
          {msg}
        </div>
      )}

      {/* ─── Tab 1: 显示设置 ───────────────────── */}
      {tab === 'settings' && (
        <div style={{ maxWidth: 560 }}>
          <section style={sectionStyle}>
            <h3 style={h3Style}>📐 Zoom 门槛</h3>
            <div style={gridStyle}>
              {input('local_major 开始显示', settings.localMajorShowZoom, (v) => setSettings({ ...settings, localMajorShowZoom: v }), 'number', '0.5')}
              {input('local_major 淡入起点', settings.localMajorFadeStart, (v) => setSettings({ ...settings, localMajorFadeStart: v }), 'number', '0.5')}
              {input('local 开始显示', settings.localShowZoom, (v) => setSettings({ ...settings, localShowZoom: v }), 'number', '0.5')}
              {input('local 淡入起点', settings.localFadeStart, (v) => setSettings({ ...settings, localFadeStart: v }), 'number', '0.5')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>🔗 聚类参数（像素阈值）</h3>
            <div style={gridStyle}>
              {input('zoom < 6', settings.clusterRZ1, (v) => setSettings({ ...settings, clusterRZ1: Number(v) }), 'number')}
              {input('zoom 6-8', settings.clusterRZ2, (v) => setSettings({ ...settings, clusterRZ2: Number(v) }), 'number')}
              {input('zoom 8-10', settings.clusterRZ3, (v) => setSettings({ ...settings, clusterRZ3: Number(v) }), 'number')}
              {input('zoom ≥ 10', settings.clusterRZ4, (v) => setSettings({ ...settings, clusterRZ4: Number(v) }), 'number')}
              {input('major 聚类比例', settings.majorClusterRatio, (v) => setSettings({ ...settings, majorClusterRatio: v }), 'number', '0.05')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>📏 网格去重（像素）</h3>
            <div style={gridStyle}>
              {input('zoom < 6', settings.dedupZ1, (v) => setSettings({ ...settings, dedupZ1: Number(v) }), 'number')}
              {input('zoom 6-8', settings.dedupZ2, (v) => setSettings({ ...settings, dedupZ2: Number(v) }), 'number')}
              {input('zoom 8-10', settings.dedupZ3, (v) => setSettings({ ...settings, dedupZ3: Number(v) }), 'number')}
              {input('zoom ≥ 10', settings.dedupZ4, (v) => setSettings({ ...settings, dedupZ4: Number(v) }), 'number')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>🔵 圆点大小 (px)</h3>
            <div style={gridStyle}>
              {input('hub 半径', settings.hubRadius, (v) => setSettings({ ...settings, hubRadius: Number(v) }), 'number')}
              {input('major 半径', settings.majorRadius, (v) => setSettings({ ...settings, majorRadius: Number(v) }), 'number')}
              {input('local_major 半径', settings.localMajorRadius, (v) => setSettings({ ...settings, localMajorRadius: v }), 'number', '0.5')}
              {input('local 半径', settings.localRadius, (v) => setSettings({ ...settings, localRadius: Number(v) }), 'number')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>🎨 颜色</h3>
            <div style={gridStyle}>
              {colorInput('hub', settings.hubColor, (v) => setSettings({ ...settings, hubColor: v }))}
              {colorInput('major', settings.majorColor, (v) => setSettings({ ...settings, majorColor: v }))}
              {colorInput('local_major', settings.localMajorColor, (v) => setSettings({ ...settings, localMajorColor: v }))}
              {colorInput('local', settings.localColor, (v) => setSettings({ ...settings, localColor: v }))}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={handleReset} style={btnStyle('#f3f4f6', '#374151')}>恢复默认</button>
            <button onClick={handleSave} disabled={saving} style={btnStyle('#2563eb', '#fff')}>
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      )}

      {/* ─── Tab 2: 站点管理 ───────────────────── */}
      {tab === 'stations' && (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input
              placeholder="搜索站名..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadOverrides(searchQ)}
              style={{
                flex: 1, padding: '6px 12px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: 13,
              }}
            />
            <button onClick={() => loadOverrides(searchQ)} style={btnStyle('#f3f4f6', '#374151')}>搜索</button>
            <button onClick={() => openEdit()} style={btnStyle('#2563eb', '#fff')}>+ 新增覆盖</button>
          </div>

          {stationsLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>加载中...</div>
          ) : overrides.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              {searchQ ? '无匹配记录' : '暂无自定义覆盖，点击「新增覆盖」添加'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={thStyle}>站名</th>
                  <th style={thStyle}>覆盖名</th>
                  <th style={thStyle}>级别覆盖</th>
                  <th style={thStyle}>显示级别</th>
                  <th style={thStyle}>操作</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={tdStyle}>{row.stationName}</td>
                    <td style={tdStyle}>{row.displayName || '-'}</td>
                    <td style={tdStyle}>
                      {row.levelOverride ? <span style={badgeStyle(row.levelOverride)}>{levelLabels[row.levelOverride] || row.levelOverride}</span> : '-'}
                    </td>
                    <td style={tdStyle}>
                      {row.displayLevel ? <span style={badgeStyle(row.displayLevel)}>{levelLabels[row.displayLevel] || row.displayLevel}</span> : '-'}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => openEdit(row)} style={linkBtnStyle}>编辑</button>
                      <button onClick={() => handleOverrideDelete(row.stationName)} style={{ ...linkBtnStyle, color: '#dc2626' }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Edit Modal ────────────────────────── */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 10, padding: 24, width: 400, maxHeight: '80vh', overflow: 'auto',
          }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
              {editItem.id ? '编辑覆盖' : '新增覆盖'}
            </h3>
            <div style={gridStyle}>
              {input('站名 *', editItem.stationName || '', (v) => setEditItem({ ...editItem, stationName: v }))}
              {input('覆盖显示名', editItem.displayName || '', (v) => setEditItem({ ...editItem, displayName: v }))}
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 4 }}>级别覆盖</label>
              <select
                value={editItem.levelOverride || ''}
                onChange={(e) => setEditItem({ ...editItem, levelOverride: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
              >
                <option value="">不覆盖</option>
                <option value="hub">枢纽</option>
                <option value="major">地级</option>
                <option value="local_major">县级</option>
                <option value="local">其他</option>
                <option value="deleted">删除</option>
              </select>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 4 }}>显示级别（类调整）</label>
              <select
                value={editItem.displayLevel || ''}
                onChange={(e) => setEditItem({ ...editItem, displayLevel: e.target.value })}
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
              >
                <option value="">不调整</option>
                <option value="hub">枢纽</option>
                <option value="major">地级</option>
                <option value="local_major">县级</option>
                <option value="local">其他</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={btnStyle('#f3f4f6', '#374151')}>取消</button>
              <button onClick={handleOverrideSave} style={btnStyle('#2563eb', '#fff')}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── shared styles ────────────────────────────
const sectionStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
  padding: '16px 20px', marginBottom: 16,
};
const h3Style: React.CSSProperties = { margin: '0 0 10px', fontSize: 14, fontWeight: 600, color: '#1f2937' };
const gridStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const thStyle: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, color: '#374151' };
const tdStyle: React.CSSProperties = { padding: '8px 12px', color: '#4b5563' };
const btnStyle = (bg: string, color: string): React.CSSProperties => ({
  padding: '8px 18px', background: bg, color, border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
});
const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#2563eb',
  fontSize: 12, cursor: 'pointer', padding: '2px 8px',
};
const badgeStyle = (level: string): React.CSSProperties => {
  const colors: Record<string, string> = {
    hub: '#dc2626', major: '#d97706', local_major: '#059669', local: '#6b7280', deleted: '#9ca3af',
  };
  return {
    background: (colors[level] || '#9ca3af') + '1a',
    color: colors[level] || '#9ca3af',
    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
  };
};
