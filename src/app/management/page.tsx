'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from './admin-auth';

interface Stats {
  totalUsers: number;
  todayUsers: number;
  totalPosts: number;
  totalComments: number;
  totalFavorites: number;
  totalFriends: number;
  totalPlans: number;
  activeKeys: number;
}

interface WeeklyData {
  dates: string[];
  users: number[];
  posts: number[];
  plans: number[];
}

function MiniChart({ data, labels, color, title }: { data: number[]; labels: string[]; color: string; title: string }) {
  if (!data || data.length === 0) return null;
  const W = 400, H = 160;
  const PL = 10, PR = 10, PT = 16, PB = 28;
  const pw = W - PL - PR, ph = H - PT - PB;
  const maxVal = Math.max(...data, 1);
  const points = data.map((v, i) => ({
    x: PL + (i / (data.length - 1)) * pw,
    y: PT + ph - (v / maxVal) * ph,
    v,
  }));
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${points[0].x},${points[0].y} ${points.map((p) => `L${p.x},${p.y}`).join(' ')} L${points[points.length - 1].x},${PT + ph} L${points[0].x},${PT + ph} Z`;
  const gradId = `grad-${title}`;
  const total = data.reduce((s, v) => s + v, 0);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <span className="chart-title">{title}</span>
        <span className="chart-total" style={{ color }}>{total}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke={color} strokeWidth="2" />
            {p.v > 0 && <text x={p.x} y={p.y - 10} textAnchor="middle" fill={color} fontSize="11" fontWeight="600">{p.v}</text>}
          </g>
        ))}
        {labels.map((l, i) => (
          <text key={i} x={PL + (i / (labels.length - 1)) * pw} y={H - 6} textAnchor="middle" fill="#9ca3af" fontSize="11">{l}</text>
        ))}
      </svg>
    </div>
  );
}

const quickNav = [
  { path: '/management/users', icon: '👥', label: '用户管理', desc: '管理注册用户' },
  { path: '/management/posts', icon: '📝', label: '帖子管理', desc: '审核与管理帖子' },
  { path: '/management/comments', icon: '💬', label: '评论管理', desc: '管理用户评论' },
  { path: '/management/plans', icon: '✈️', label: '旅行计划', desc: '查看旅行计划' },
  { path: '/management/keys', icon: '🔑', label: '密钥管理', desc: '管理系统密钥' },
  { path: '/management/markers', icon: '📍', label: '标记点', desc: '地图标记管理' },
  { path: '/management/lists', icon: '🏆', label: '榜单管理', desc: '管理推荐榜单' },
  { path: '/management/list_items', icon: '📋', label: '榜单项', desc: '管理榜单内容' },
  { path: '/management/packing', icon: '🎒', label: '行李清单', desc: '行李模板管理' },
  { path: '/management/embed-logs', icon: '📈', label: '嵌入访问', desc: '嵌入页访问统计' },
  { path: '/management/alist', icon: '☁️', label: '网盘配置', desc: 'AList 云存储' },
  { path: '/management/footprints', icon: '👣', label: '足迹分组', desc: '足迹数据管理' },
];

export default function DashboardPage() {
  const { logout } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/admin/stats', { headers }).then((r) => r.json()),
      fetch('/api/admin/stats/weekly', { headers }).then((r) => r.json()),
    ])
      .then(([statsData, weeklyData]) => {
        if (statsData.stats) setStats(statsData.stats);
        if (weeklyData.weekly) setWeekly(weeklyData.weekly);
      })
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    { title: '总用户数', value: stats?.totalUsers ?? 0, color: '#2563eb' },
    { title: '今日新增', value: stats?.todayUsers ?? 0, color: '#059669' },
    { title: '帖子总数', value: stats?.totalPosts ?? 0, color: '#d97706' },
    { title: '评论总数', value: stats?.totalComments ?? 0, color: '#dc2626' },
    { title: '收藏总数', value: stats?.totalFavorites ?? 0, color: '#7c3aed' },
    { title: '好友关系', value: stats?.totalFriends ?? 0, color: '#0891b2' },
    { title: '旅行计划', value: stats?.totalPlans ?? 0, color: '#db2777' },
    { title: '活跃密钥', value: stats?.activeKeys ?? 0, color: '#ea580c' },
  ];

  if (loading) {
    return (
      <div className="dash-loading">
        <div className="loading-spinner" />
        <style>{`
          .dash-loading { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
          .loading-spinner {
            width: 32px; height: 32px; border: 3px solid var(--color-border, #e5e7eb);
            border-top-color: var(--color-primary, #2563eb); border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div className="dash">
      <header className="dash-header">
        <div>
          <h1 className="dash-title">管理后台</h1>
          <p className="dash-subtitle">数据概览与快捷入口</p>
        </div>
        <button className="dash-logout" onClick={logout}>退出登录</button>
      </header>

      <section className="dash-section">
        <h2 className="section-title">数据概览</h2>
        <div className="stats-grid">
          {statCards.map((card) => (
            <div key={card.title} className="stat-card">
              <div className="stat-accent" style={{ background: card.color }} />
              <div className="stat-body">
                <span className="stat-label">{card.title}</span>
                <span className="stat-value" style={{ color: card.color }}>{card.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {weekly && (
        <section className="dash-section">
          <h2 className="section-title">近 7 天趋势</h2>
          <div className="charts-grid">
            <MiniChart data={weekly.users} labels={weekly.dates} color="#2563eb" title="新增用户" />
            <MiniChart data={weekly.posts} labels={weekly.dates} color="#d97706" title="新增帖子" />
            <MiniChart data={weekly.plans} labels={weekly.dates} color="#db2777" title="新增计划" />
          </div>
        </section>
      )}

      <section className="dash-section">
        <h2 className="section-title">快捷入口</h2>
        <div className="nav-grid">
          {quickNav.map((item) => (
            <Link key={item.path} href={item.path} className="nav-card">
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-desc">{item.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      <style>{`
        .dash { padding: 0; }
        .dash-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 32px;
        }
        .dash-title {
          margin: 0; font-size: 26px; font-weight: 700;
          color: var(--color-text, #1f2937); letter-spacing: -0.02em;
        }
        .dash-subtitle {
          margin: 4px 0 0; font-size: 14px;
          color: var(--color-text-muted, #6b7280);
        }
        .dash-logout {
          background: none; border: 1px solid var(--color-border, #e5e7eb);
          color: var(--color-text-muted, #6b7280); padding: 8px 16px;
          border-radius: 8px; font-size: 13px; cursor: pointer;
          transition: all 0.15s; white-space: nowrap;
        }
        .dash-logout:hover {
          border-color: var(--color-danger, #dc2626);
          color: var(--color-danger, #dc2626);
        }

        .dash-section { margin-bottom: 36px; }
        .section-title {
          margin: 0 0 16px; font-size: 16px; font-weight: 600;
          color: var(--color-text, #1f2937);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .stat-card {
          display: flex; overflow: hidden;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 10px; transition: box-shadow 0.15s;
        }
        .stat-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .stat-accent { width: 4px; flex-shrink: 0; }
        .stat-body {
          display: flex; flex-direction: column; padding: 16px 18px; gap: 4px;
        }
        .stat-label { font-size: 13px; color: var(--color-text-muted, #6b7280); }
        .stat-value { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }

        .charts-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }
        .chart-card {
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 10px; padding: 16px 18px 12px; transition: box-shadow 0.15s;
        }
        .chart-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
        .chart-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
        }
        .chart-title { font-size: 14px; font-weight: 600; color: var(--color-text, #1f2937); }
        .chart-total { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
        .chart-svg { width: 100%; height: auto; display: block; }

        .nav-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .nav-card {
          display: flex; flex-direction: column; align-items: flex-start;
          padding: 20px; gap: 6px;
          background: var(--color-surface, #fff);
          border: 1px solid var(--color-border, #e5e7eb);
          border-radius: 10px; text-decoration: none; color: inherit;
          transition: all 0.15s;
        }
        .nav-card:hover {
          border-color: var(--color-primary, #2563eb);
          box-shadow: 0 4px 16px rgba(37,99,235,0.08);
          transform: translateY(-2px);
        }
        .nav-icon { font-size: 24px; margin-bottom: 2px; }
        .nav-label { font-size: 15px; font-weight: 600; color: var(--color-text, #1f2937); }
        .nav-desc { font-size: 12px; color: var(--color-text-muted, #6b7280); }

        @media (max-width: 1024px) {
          .stats-grid { grid-template-columns: repeat(3, 1fr); }
          .charts-grid { grid-template-columns: repeat(2, 1fr); }
          .nav-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .charts-grid { grid-template-columns: 1fr; }
          .nav-grid { grid-template-columns: repeat(2, 1fr); }
          .dash-header { flex-direction: column; gap: 12px; }
        }
      `}</style>
    </div>
  );
}
