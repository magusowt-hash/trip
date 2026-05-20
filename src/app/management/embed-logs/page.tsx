'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';
import styles from './page.module.css';

const ACTION_LABELS: Record<string, string> = {
  page_view: '页面访问',
  list_click: '点击榜单',
  item_click: '点击数据',
};

export default function EmbedLogsPage() {
  const { token } = useAdminAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  const fetchLogs = () => {
    setLoading(true);
    fetch('/api/admin/embed-logs?limit=200', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (!token) return;
    fetchLogs();
  }, [token]);

  const filtered = filter ? logs.filter(l => l.action === filter) : logs;
  const getBadgeClassName = (action: string) => {
    if (action === 'page_view') return `${styles.badge} ${styles.badgePageView}`;
    if (action === 'list_click') return `${styles.badge} ${styles.badgeListClick}`;
    return `${styles.badge} ${styles.badgeItemClick}`;
  };

  const getDesc = (log: any) => {
    if (log.action === 'page_view') return '访问 /lists-embed 页面';
    if (log.action === 'list_click') return `切换到榜单「${log.list_name || log.list_id}」`;
    if (log.action === 'item_click') return `点击数据项「${log.item_name || log.item_id}」`;
    return '-';
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.headerTitle}>嵌入访问记录</h1>
          <p className={styles.headerDescription}>查看嵌入页访问、榜单切换和数据点击行为。</p>
        </div>
        <button className={styles.refreshButton} onClick={fetchLogs} disabled={loading}>
          {loading ? '加载中…' : '刷新数据'}
        </button>
      </div>
      <div className={styles.filters}>
        <button className={`${styles.filterButton} ${!filter ? styles.filterButtonActive : ''}`} onClick={() => setFilter('')}>全部</button>
        <button className={`${styles.filterButton} ${filter === 'page_view' ? styles.filterButtonActive : ''}`} onClick={() => setFilter('page_view')}>页面访问</button>
        <button className={`${styles.filterButton} ${filter === 'list_click' ? styles.filterButtonActive : ''}`} onClick={() => setFilter('list_click')}>点击榜单</button>
        <button className={`${styles.filterButton} ${filter === 'item_click' ? styles.filterButtonActive : ''}`} onClick={() => setFilter('item_click')}>点击数据</button>
      </div>
      <div className={styles.summary}>
        <span>共 {filtered.length} 条记录</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>时间</th>
              <th>IP</th>
              <th>操作描述</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(log => (
              <tr key={log.id}>
                <td>{log.createdAt ? new Date(log.createdAt).toLocaleString('zh-CN') : '-'}</td>
                <td>{log.ip}</td>
                <td className={styles.desc}><span className={getBadgeClassName(log.action)}>{getDesc(log)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
