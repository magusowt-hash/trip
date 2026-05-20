'use client';

import { useEffect, useState } from 'react';
import { buildAdminHeaders, useAdminAuth } from './admin-auth';
import styles from './page.module.css';

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

function MiniChart({ data, labels, title }: { data: number[]; labels: string[]; title: string }) {
  if (!data || data.length === 0) return null;
  const W = 400;
  const H = 160;
  const PL = 10;
  const PR = 10;
  const PT = 16;
  const PB = 28;
  const pw = W - PL - PR;
  const ph = H - PT - PB;
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
    <article className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <h3 className={styles.chartTitle}>{title}</h3>
        <span className={styles.chartTotal}>{total.toLocaleString()}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111827" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#111827" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <polyline points={linePoints} fill="none" stroke="#111827" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#ffffff" stroke="#111827" strokeWidth="1.5" />
        ))}
        {labels.map((l, i) => (
          <text key={i} x={PL + (i / (labels.length - 1)) * pw} y={H - 6} textAnchor="middle" fill="#9ca3af" fontSize="11">
            {l}
          </text>
        ))}
      </svg>
    </article>
  );
}

export default function DashboardPage() {
  const { token } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = buildAdminHeaders(token);
    Promise.all([
      fetch('/api/admin/stats', { headers }).then((r) => r.json()),
      fetch('/api/admin/stats/weekly', { headers }).then((r) => r.json()),
    ])
      .then(([statsData, weeklyData]) => {
        if (statsData.stats) setStats(statsData.stats);
        if (weeklyData.weekly) setWeekly(weeklyData.weekly);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const statRows = [
    { label: '总用户数', value: stats?.totalUsers ?? 0 },
    { label: '今日新增', value: stats?.todayUsers ?? 0 },
    { label: '帖子总数', value: stats?.totalPosts ?? 0 },
    { label: '评论总数', value: stats?.totalComments ?? 0 },
    { label: '收藏总数', value: stats?.totalFavorites ?? 0 },
    { label: '好友关系', value: stats?.totalFriends ?? 0 },
    { label: '旅行计划', value: stats?.totalPlans ?? 0 },
    { label: '活跃密钥', value: stats?.activeKeys ?? 0 },
  ];

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.dashboardShell}>
        <div className={styles.trendColumn}>
          {weekly ? (
            <div className={styles.chartStack}>
              <MiniChart data={weekly.users} labels={weekly.dates} title="新增用户" />
              <MiniChart data={weekly.posts} labels={weekly.dates} title="新增帖子" />
              <MiniChart data={weekly.plans} labels={weekly.dates} title="新增计划" />
            </div>
          ) : null}
        </div>

        <aside className={styles.dataColumn}>
          <div className={styles.dataList}>
            {statRows.map((row) => (
              <div key={row.label} className={styles.dataRow}>
                <span className={styles.dataLabel}>{row.label}</span>
                <strong className={styles.dataValue}>{row.value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
