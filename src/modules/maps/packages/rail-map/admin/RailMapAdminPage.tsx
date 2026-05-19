'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/app/management/admin-auth';

interface RailSettings {
  majorShowZoom: string; majorFadeStart: string;
  localMajorShowZoom: string; localMajorFadeStart: string;
  localShowZoom: string; localFadeStart: string;
  mtShowZoom: string; mtFadeStart: string;
  routeMinPointsZ1: number; routeMinPointsZ2: number;
  lineWidthScale: string; dotScalePerZoom: string;
  clusterRZ1: number; clusterRZ2: number; clusterRZ3: number;
  clusterRZ4: number; clusterRZ5: number; clusterRZ6: number;
  majorClusterRatio: string;
  dedupZ1: number; dedupZ2: number; dedupZ3: number;
  dedupZ4: number; dedupZ5: number; dedupZ6: number;
  hubRadius: number; majorRadius: number;
  localMajorRadius: string; localRadius: string; mtRadius: string;
  hubColor: string; majorColor: string;
  localMajorColor: string; localColor: string; mtColor: string;
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
  majorShowZoom: '5.0', majorFadeStart: '4.0',
  localMajorShowZoom: '8.0', localMajorFadeStart: '7.0',
  localShowZoom: '9.0', localFadeStart: '8.0',
  mtShowZoom: '11.0', mtFadeStart: '10.0',
  routeMinPointsZ1: 5, routeMinPointsZ2: 3,
  lineWidthScale: '0.8', dotScalePerZoom: '0.06',
  clusterRZ1: 44, clusterRZ2: 32, clusterRZ3: 22, clusterRZ4: 14, clusterRZ5: 8, clusterRZ6: 4,
  majorClusterRatio: '0.70',
  dedupZ1: 40, dedupZ2: 28, dedupZ3: 20, dedupZ4: 14, dedupZ5: 10, dedupZ6: 6,
  hubRadius: 5, majorRadius: 4, localMajorRadius: '2.5', localRadius: '2', mtRadius: '1.5',
  hubColor: '#dc2626', majorColor: '#f59e0b', localMajorColor: '#10b981', localColor: '#9ca3af', mtColor: '#d1d5db',
};

const levelLabels: Record<string, string> = {
  CH: '核心枢纽', RK: '区域重点', GI: '一般客运', AS: '辅助站', MT: '待定', deleted: '已删除',
};

export function RailMapAdminPage() {
  const { token } = useAdminAuth();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const [tab, setTab] = useState<'settings' | 'stations'>('settings');
  const [settings, setSettings] = useState<RailSettings>({ ...DEFAULTS });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [allStations, setAllStations] = useState<RailStation[]>([]);
  const [stationsLoaded, setStationsLoaded] = useState(false);
  const [overrides, setOverrides] = useState<StationOverride[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [stationsLoading, setStationsLoading] = useState(false);
  const [rowForms, setRowForms] = useState<Record<string, { displayName: string; levelOverride: string; displayLevel: string }>>({});
  const [savingName, setSavingName] = useState<string | null>(null);

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

  useEffect(() => {
    fetch('/api/admin/maps/rail/settings', { headers })
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setSettings(d.settings);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (tab !== 'stations' || stationsLoaded) return;
    fetch('/data/stations.json')
      .then((r) => r.json())
      .then((d) => {
        setAllStations(d.stations || []);
        setStationsLoaded(true);
      })
      .catch(() => setStationsLoaded(true));
  }, [tab, stationsLoaded]);

  const loadOverrides = () => {
    setStationsLoading(true);
    fetch('/api/admin/station-overrides', { headers })
      .then((r) => r.json())
      .then((d) => {
        setOverrides(d.list || []);
      })
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
      setMsg(data.settings ? '✅ 设置已保存' : '❌ 保存失败');
    } catch {
      setMsg('❌ 网络错误');
    } finally {
      setSaving(false);
    }
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
    } catch {
      setMsg('❌ 保存失败');
    } finally {
      setSavingName(null);
    }
  };

  const handleOverrideDelete = async (name: string) => {
    if (!confirm(`确定删除「${name}」的覆盖记录？`)) return;
    try {
      await fetch(`/api/admin/station-overrides/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers,
      });
      loadOverrides();
      setMsg('✅ 已删除');
    } catch {
      setMsg('❌ 删除失败');
    }
  };

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

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', color: '#1f2937' }}>中国铁路地图管理</h1>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #e5e7eb' }}>
        {[
          ['settings', '显示设置'],
          ['stations', '站点管理'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k as 'settings' | 'stations')}
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

      {msg ? (
        <div
          style={{
            padding: '8px 14px', borderRadius: 6, marginBottom: 16, fontSize: 13,
            background: msg.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
            color: msg.startsWith('✅') ? '#065f46' : '#991b1b',
          }}
        >
          {msg}
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div style={{ maxWidth: 560 }}>
          <section style={sectionStyle}>
            <h3 style={h3Style}>📐 渐显门槛</h3>
            <div style={gridStyle}>
              {input('区域重点(RK) 开始显示', settings.majorShowZoom, (v) => setSettings({ ...settings, majorShowZoom: v }), 'number', '0.5')}
              {input('区域重点(RK) 淡入起点', settings.majorFadeStart, (v) => setSettings({ ...settings, majorFadeStart: v }), 'number', '0.5')}
              {input('一般客运(GI) 开始显示', settings.localMajorShowZoom, (v) => setSettings({ ...settings, localMajorShowZoom: v }), 'number', '0.5')}
              {input('一般客运(GI) 淡入起点', settings.localMajorFadeStart, (v) => setSettings({ ...settings, localMajorFadeStart: v }), 'number', '0.5')}
              {input('辅助站(AS) 开始显示', settings.localShowZoom, (v) => setSettings({ ...settings, localShowZoom: v }), 'number', '0.5')}
              {input('辅助站(AS) 淡入起点', settings.localFadeStart, (v) => setSettings({ ...settings, localFadeStart: v }), 'number', '0.5')}
              {input('待定(MT) 开始显示', settings.mtShowZoom, (v) => setSettings({ ...settings, mtShowZoom: v }), 'number', '0.5')}
              {input('待定(MT) 淡入起点', settings.mtFadeStart, (v) => setSettings({ ...settings, mtFadeStart: v }), 'number', '0.5')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>🔗 聚类阈值（6档线性插值）</h3>
            <div style={gridStyle}>
              {input('Z1: zoom < 5', settings.clusterRZ1, (v) => setSettings({ ...settings, clusterRZ1: Number(v) }), 'number')}
              {input('Z2: zoom 5~7', settings.clusterRZ2, (v) => setSettings({ ...settings, clusterRZ2: Number(v) }), 'number')}
              {input('Z3: zoom 7~9', settings.clusterRZ3, (v) => setSettings({ ...settings, clusterRZ3: Number(v) }), 'number')}
              {input('Z4: zoom 9~11', settings.clusterRZ4, (v) => setSettings({ ...settings, clusterRZ4: Number(v) }), 'number')}
              {input('Z5: zoom 11~13', settings.clusterRZ5, (v) => setSettings({ ...settings, clusterRZ5: Number(v) }), 'number')}
              {input('Z6: zoom ≥ 13', settings.clusterRZ6, (v) => setSettings({ ...settings, clusterRZ6: Number(v) }), 'number')}
              {input('区域重点(RK) 聚类比例', settings.majorClusterRatio, (v) => setSettings({ ...settings, majorClusterRatio: v }), 'number', '0.05')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>📏 网格去重（6档线性插值）</h3>
            <div style={gridStyle}>
              {input('Z1: zoom < 5', settings.dedupZ1, (v) => setSettings({ ...settings, dedupZ1: Number(v) }), 'number')}
              {input('Z2: zoom 5~7', settings.dedupZ2, (v) => setSettings({ ...settings, dedupZ2: Number(v) }), 'number')}
              {input('Z3: zoom 7~9', settings.dedupZ3, (v) => setSettings({ ...settings, dedupZ3: Number(v) }), 'number')}
              {input('Z4: zoom 9~11', settings.dedupZ4, (v) => setSettings({ ...settings, dedupZ4: Number(v) }), 'number')}
              {input('Z5: zoom 11~13', settings.dedupZ5, (v) => setSettings({ ...settings, dedupZ5: Number(v) }), 'number')}
              {input('Z6: zoom ≥ 13', settings.dedupZ6, (v) => setSettings({ ...settings, dedupZ6: Number(v) }), 'number')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>🚂 线路渲染</h3>
            <div style={gridStyle}>
              {input('低zoom最少点数(Z1)', settings.routeMinPointsZ1, (v) => setSettings({ ...settings, routeMinPointsZ1: Number(v) }), 'number')}
              {input('中zoom最少点数(Z2)', settings.routeMinPointsZ2, (v) => setSettings({ ...settings, routeMinPointsZ2: Number(v) }), 'number')}
              {input('线宽基础比例', settings.lineWidthScale, (v) => setSettings({ ...settings, lineWidthScale: v }), 'number', '0.1')}
              {input('圆点缩放/zoom', settings.dotScalePerZoom, (v) => setSettings({ ...settings, dotScalePerZoom: v }), 'number', '0.01')}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={h3Style}>🟢 圆点大小 / 颜色</h3>
            <div style={gridStyle}>
              {input('核心枢纽(CH) 半径', settings.hubRadius, (v) => setSettings({ ...settings, hubRadius: Number(v) }), 'number')}
              {colorInput('核心枢纽(CH) 颜色', settings.hubColor, (v) => setSettings({ ...settings, hubColor: v }))}
              {input('区域重点(RK) 半径', settings.majorRadius, (v) => setSettings({ ...settings, majorRadius: Number(v) }), 'number')}
              {colorInput('区域重点(RK) 颜色', settings.majorColor, (v) => setSettings({ ...settings, majorColor: v }))}
              {input('一般客运(GI) 半径', settings.localMajorRadius, (v) => setSettings({ ...settings, localMajorRadius: v }), 'number', '0.5')}
              {colorInput('一般客运(GI) 颜色', settings.localMajorColor, (v) => setSettings({ ...settings, localMajorColor: v }))}
              {input('辅助站(AS) 半径', settings.localRadius, (v) => setSettings({ ...settings, localRadius: v }), 'number')}
              {colorInput('辅助站(AS) 颜色', settings.localColor, (v) => setSettings({ ...settings, localColor: v }))}
              {input('待定(MT) 半径', settings.mtRadius, (v) => setSettings({ ...settings, mtRadius: v }), 'number', '0.5')}
              {colorInput('待定(MT) 颜色', settings.mtColor, (v) => setSettings({ ...settings, mtColor: v }))}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button onClick={() => setSettings({ ...DEFAULTS })} style={btnStyle('#f3f4f6', '#374151')}>恢复默认</button>
            <button onClick={handleSave} disabled={saving} style={btnStyle('#2563eb', '#fff')}>
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <input
              placeholder="搜索站名..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid #d1d5db',
                borderRadius: 6, fontSize: 13, maxWidth: 320,
              }}
            />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{allStations.length.toLocaleString()} 站</span>
          </div>

          {searchQ.length >= 1 ? (
            (() => {
              const q = searchQ.toLowerCase();
              const matches = allStations.filter((st) => st.name.toLowerCase().includes(q)).slice(0, 50);

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
                          {hasOv ? (
                            <button
                              onClick={() => handleOverrideDelete(name)}
                              style={{ ...linkBtnStyle, color: '#dc2626', fontSize: 11, whiteSpace: 'nowrap' }}
                            >
                              删
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : null}

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

const sectionStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
  background: '#fff',
};

const h3Style: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 600,
  color: '#111827',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
};

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: bg,
    color,
    fontSize: 13,
    cursor: 'pointer',
  };
}

function badgeStyle(level: string): React.CSSProperties {
  const map: Record<string, string> = {
    CH: '#dc2626',
    RK: '#f59e0b',
    GI: '#2563eb',
    AS: '#6b7280',
    MT: '#9ca3af',
  };
  return {
    fontSize: 11,
    padding: '2px 6px',
    borderRadius: 999,
    background: `${map[level] || '#6b7280'}22`,
    color: map[level] || '#6b7280',
  };
}

const linkBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
};

