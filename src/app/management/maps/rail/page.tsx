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

interface RailStation {
  name: string;
  lng: number;
  lat: number;
  level: string;
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
  CH: '核心枢纽', RK: '区域重点', GI: '一般客运', AS: '辅助站', MT: '待定', deleted: '已删除',
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
  const [allStations, setAllStations] = useState<RailStation[]>([]);
  const [stationsLoaded, setStationsLoaded] = useState(false);
  const [overrides, setOverrides] = useState<StationOverride[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [stationsLoading, setStationsLoading] = useState(false);

  // 行内编辑 —— 每行直接显示控件
  const [rowForms, setRowForms] = useState<Record<string, { displayName: string; levelOverride: string; displayLevel: string }>>({});
  const [savingName, setSavingName] = useState<string | null>(null);

  // overrides 加载后同步到 rowForms
  useEffect(() => {
    const forms: Record<string, { displayName: string; levelOverride: string; displayLevel: string }> = {};
    overrides.forEach((o) => {
      forms[o.stationName] = {
        displayName: o.displayName || '',
        levelOverride: o.levelOverride || '',
        displayLevel: o.displayLevel || '',
      };
    });
    setRowForms(forms);
  }, [overrides]);

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

  // 加载车站数据 JSON（与前台界面检索一致）
  useEffect(() => {
    if (tab !== 'stations' || stationsLoaded) return;
    fetch('/data/stations.json')
      .then((r) => r.json())
      .then((d) => { setAllStations(d.stations || []); setStationsLoaded(true); })
      .catch(() => setStationsLoaded(true));
  }, [tab, stationsLoaded]);

  // 加载全部覆盖列表
  const loadOverrides = () => {
    setStationsLoading(true);
    fetch('/api/admin/station-overrides', { headers })
      .then((r) => r.json())
      .then((d) => { setOverrides(d.list || []); })
      .finally(() => setStationsLoading(false));
  };

  useEffect(() => {
    if (tab === 'stations') loadOverrides();
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

  const updateRowForm = (name: string, patch: Partial<{ displayName: string; levelOverride: string; displayLevel: string }>) => {
    setRowForms((prev) => ({
      ...prev,
      [name]: { ...(prev[name] || { displayName: '', levelOverride: '', displayLevel: '' }), ...patch },
    }));
  };

  const handleRowSave = async (stationName: string) => {
    const form = rowForms[stationName] || { displayName: '', levelOverride: '', displayLevel: '' };
    if (!stationName.trim()) return;
    setSavingName(stationName);
    try {
      const res = await fetch('/api/admin/station-overrides', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationName, ...form }),
      });
      const data = await res.json();
      if (data.success) {
        loadOverrides();
        setMsg('✅ 覆盖已保存');
      }
    } catch { setMsg('❌ 保存失败'); }
    finally { setSavingName(null); }
  };

  const handleOverrideDelete = async (name: string) => {
    if (!confirm(`确定删除「${name}」的覆盖记录？`)) return;
    try {
      await fetch(`/api/admin/station-overrides/${encodeURIComponent(name)}`, {
        method: 'DELETE', headers,
      });
      loadOverrides();
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
          <div style={{ marginBottom: 16 }}>
            <input
              placeholder="输入站名搜索（共 4,620 站）…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{
                width: '100%', padding: '6px 12px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
              }}
            />
          </div>

          {!stationsLoaded ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>加载车站数据中...</div>
          ) : searchQ.trim() ? (
            (() => {
              const q = searchQ.trim().toLowerCase();
              const matches = allStations
                .filter((s) => s.name && s.name.toLowerCase().includes(q))
                .slice(0, 50);

              if (matches.length === 0) {
                return <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>未找到匹配站点</div>;
              }

              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                    找到 {matches.length} 个站点（{allStations.length.toLocaleString()} 站中匹配）
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {matches.map((st) => {
                      const name = st.name;
                      const form = rowForms[name] || { displayName: '', levelOverride: '', displayLevel: '' };
                      const hasOv = form.levelOverride || form.displayName || form.displayLevel;
                      return (
                        <div
                          key={name}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6,
                            background: hasOv ? '#f0fdf4' : '#fff',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ fontWeight: 500, fontSize: 13, minWidth: 90 }}>{name}</span>
                          <span style={badgeStyle(st.level)}>{levelLabels[st.level] || st.level}</span>

                          <span style={{ flex: 1, minWidth: 4 }} />
                          <input
                            placeholder="显示名"
                            value={form.displayName}
                            onChange={(e) => updateRowForm(name, { displayName: e.target.value })}
                            style={{ width: 70, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                          />
                          <select
                            value={form.levelOverride}
                            onChange={(e) => updateRowForm(name, { levelOverride: e.target.value })}
                            style={{ width: 72, padding: '3px 2px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                          >
                            <option value="">级别</option>
                            <option value="CH">核心枢纽</option>
                            <option value="RK">区域重点</option>
                            <option value="GI">一般客运</option>
                            <option value="AS">辅助站</option>
                            <option value="MT">待定</option>
                            <option value="deleted">删除</option>
                          </select>
                          <select
                            value={form.displayLevel}
                            onChange={(e) => updateRowForm(name, { displayLevel: e.target.value })}
                            style={{ width: 72, padding: '3px 2px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                          >
                            <option value="">显示级</option>
                            <option value="CH">核心枢纽</option>
                            <option value="RK">区域重点</option>
                            <option value="GI">一般客运</option>
                            <option value="AS">辅助站</option>
                            <option value="MT">待定</option>
                          </select>
                          <button
                            onClick={() => handleRowSave(name)}
                            disabled={savingName === name}
                            style={{ padding: '3px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            {savingName === name ? '...' : '保存'}
                          </button>
                          {hasOv && (
                            <button
                              onClick={() => handleOverrideDelete(name)}
                              style={{ ...linkBtnStyle, color: '#dc2626', fontSize: 11, whiteSpace: 'nowrap' }}
                            >
                              删
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : null}

          {/* ── 已有覆盖列表 ───────────────────── */}
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '24px 0 12px' }}>
            已有覆盖 ({overrides.length})
          </h3>

          {stationsLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>加载中...</div>
          ) : overrides.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              暂无自定义覆盖，在上方搜索站名来添加
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {overrides.map((row) => {
                const name = row.stationName;
                const form = rowForms[name] || { displayName: row.displayName || '', levelOverride: row.levelOverride || '', displayLevel: row.displayLevel || '' };
                return (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 500, fontSize: 13, minWidth: 90 }}>{name}</span>
                    <input
                      placeholder="显示名"
                      value={form.displayName}
                      onChange={(e) => updateRowForm(name, { displayName: e.target.value })}
                      style={{ width: 80, padding: '3px 5px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                    />
                    <select
                      value={form.levelOverride}
                      onChange={(e) => updateRowForm(name, { levelOverride: e.target.value })}
                      style={{ width: 72, padding: '3px 2px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                    >
                      <option value="">级别</option>
                      <option value="CH">核心枢纽</option>
                      <option value="RK">区域重点</option>
                      <option value="GI">一般客运</option>
                      <option value="AS">辅助站</option>
                      <option value="MT">待定</option>
                      <option value="deleted">删除</option>
                    </select>
                    <select
                      value={form.displayLevel}
                      onChange={(e) => updateRowForm(name, { displayLevel: e.target.value })}
                      style={{ width: 72, padding: '3px 2px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                    >
                      <option value="">显示级</option>
                      <option value="CH">核心枢纽</option>
                      <option value="RK">区域重点</option>
                      <option value="GI">一般客运</option>
                      <option value="AS">辅助站</option>
                      <option value="MT">待定</option>
                    </select>
                    <span style={{ flex: 1, minWidth: 4 }} />
                    <button
                      onClick={() => handleRowSave(name)}
                      disabled={savingName === name}
                      style={{ padding: '3px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                    >
                      {savingName === name ? '...' : '保存'}
                    </button>
                    <button
                      onClick={() => handleOverrideDelete(name)}
                      style={{ ...linkBtnStyle, color: '#dc2626', fontSize: 11 }}
                    >
                      删
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
