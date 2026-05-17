'use client';

import Link from 'next/link';

const items = [
  { path: '/management/maps/rail', icon: '🚂', label: '中国铁路地图', desc: '站点显示参数、覆盖管理' },
];

export default function MapsManagementPage() {
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px', color: '#1f2937' }}>地图管理</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>管理各地图模块的显示设置与数据</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {items.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '20px 24px', borderRadius: 10,
              background: '#fff', border: '1px solid #e5e7eb',
              textDecoration: 'none', transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 28 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{item.label}</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
