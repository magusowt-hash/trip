'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminAuth } from './admin-auth';
import styles from './page.module.css';
import { getGroupedManagementNav } from './nav-config';

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
    <div className={styles.chartCard}>
      <div className={styles.chartHeader}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.chartTotal} style={{ color }}>{total}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg}>
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

export default function DashboardPage() {
  const { logout } = useAdminAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const groupedNav = getGroupedManagementNav();

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
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>后台总览</h1>
          <p className={styles.heroSubtitle}>
            通过统一入口管理系统配置、内容数据与运营模块。首页保留关键指标和趋势信息，具体功能通过左侧分组导航进入。
          </p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.heroMetaLabel}>活跃密钥</span>
          <span className={styles.heroMetaValue}>{(stats?.activeKeys ?? 0).toLocaleString()}</span>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>数据概览</h2>
            <p className={styles.sectionDescription}>优先观察用户、内容和基础配置的核心运行数据。</p>
          </div>
          <button type="button" onClick={logout} className={styles.sectionAction}>退出当前登录</button>
        </div>
        <div className={styles.statsGrid}>
          {statCards.map((card) => (
            <div key={card.title} className={styles.statCard}>
              <div className={styles.statAccent} style={{ background: card.color }} />
              <span className={styles.statLabel}>{card.title}</span>
              <span className={styles.statValue} style={{ color: card.color }}>{card.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      {weekly && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>近 7 天趋势</h2>
              <p className={styles.sectionDescription}>快速识别新增用户、帖子和计划的变化节奏。</p>
            </div>
          </div>
          <div className={styles.chartsGrid}>
            <MiniChart data={weekly.users} labels={weekly.dates} color="#2563eb" title="新增用户" />
            <MiniChart data={weekly.posts} labels={weekly.dates} color="#d97706" title="新增帖子" />
            <MiniChart data={weekly.plans} labels={weekly.dates} color="#db2777" title="新增计划" />
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>模块导航</h2>
            <p className={styles.sectionDescription}>后台入口按系统与用户两个域划分，首页只保留摘要，完整导航在左侧栏。</p>
          </div>
        </div>
        <div className={styles.groupGrid}>
          {groupedNav.map((group) => (
            <section key={group.key} className={styles.groupCard}>
              <span className={styles.groupEyebrow}>{group.label}</span>
              <h3 className={styles.groupTitle}>{group.label}</h3>
              <p className={styles.groupDescription}>{group.description}</p>
              <div className={styles.groupLinks}>
                {group.items.map((item) => (
                  <Link key={item.path} href={item.path} className={styles.groupLink}>
                    <span className={styles.groupLinkMark}>{item.shortLabel}</span>
                    <span className={styles.groupLinkText}>
                      <span className={styles.groupLinkLabel}>{item.label}</span>
                      {item.description ? <span className={styles.groupLinkDesc}>{item.description}</span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
