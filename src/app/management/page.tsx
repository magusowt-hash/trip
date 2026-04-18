'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    fetch('/api/admin/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.stats) setStats(data.stats);
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { title: '总用户数', value: stats?.totalUsers || 0, link: '/management/users', color: '#3b82f6' },
    { title: '今日新增', value: stats?.todayUsers || 0, link: '/management/users', color: '#10b981' },
    { title: '帖子总数', value: stats?.totalPosts || 0, link: '/management/posts', color: '#f59e0b' },
    { title: '评论总数', value: stats?.totalComments || 0, link: '/management/comments', color: '#ef4444' },
    { title: '收藏总数', value: stats?.totalFavorites || 0, link: '/management/users', color: '#8b5cf6' },
    { title: '好友关系', value: stats?.totalFriends || 0, link: '/management/users', color: '#06b6d4' },
    { title: '旅行计划', value: stats?.totalPlans || 0, link: '/management/plans', color: '#ec4899' },
    { title: '活跃密钥', value: stats?.activeKeys || 0, link: '/management/keys', color: '#f97316' },
  ];

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>加载中...</div>;

  return (
    <div className="dashboard">
      <h1>数据看板</h1>
      <div className="stats-grid">
        {cards.map((card) => (
          <Link href={card.link} key={card.title} className="stat-card">
            <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
            <div className="stat-title">{card.title}</div>
          </Link>
        ))}
      </div>
      <style>{`
        .dashboard { padding: 20px; }
        h1 { margin-bottom: 24px; font-size: 24px; color: #1f2937; }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }
        .stat-card {
          background: white;
          padding: 24px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          text-decoration: none;
          color: inherit;
          transition: transform 0.2s;
        }
        .stat-card:hover { transform: translateY(-4px); }
        .stat-value { font-size: 32px; font-weight: bold; }
        .stat-title { margin-top: 8px; color: #6b7280; font-size: 14px; }
      `}</style>
    </div>
  );
}