'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

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

  const getDesc = (log: any) => {
    if (log.action === 'page_view') return '访问 /lists-embed 页面';
    if (log.action === 'list_click') return `切换到榜单「${log.list_name || log.list_id}」`;
    if (log.action === 'item_click') return `点击数据项「${log.item_name || log.item_id}」`;
    return '-';
  };

  return (
    <div className="page">
      <div className="header">
        <h1>嵌入访问记录</h1>
        <button className="refresh-btn" onClick={fetchLogs} disabled={loading}>
          {loading ? '加载中…' : '刷新数据'}
        </button>
      </div>
      <div className="filters">
        <button className={!filter ? 'active' : ''} onClick={() => setFilter('')}>全部</button>
        <button className={filter === 'page_view' ? 'active' : ''} onClick={() => setFilter('page_view')}>页面访问</button>
        <button className={filter === 'list_click' ? 'active' : ''} onClick={() => setFilter('list_click')}>点击榜单</button>
        <button className={filter === 'item_click' ? 'active' : ''} onClick={() => setFilter('item_click')}>点击数据</button>
      </div>
      <div className="summary">
        <span>共 {filtered.length} 条记录</span>
      </div>
      <table className="log-table">
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
              <td className="desc"><span className={`badge badge-${log.action}`}>{getDesc(log)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <style>{`
        .page { padding: 20px; max-width: 900px; margin: 0 auto; }
        .header { margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
        .header h1 { margin: 0; font-size: 20px; }
        .refresh-btn { padding: 6px 14px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .refresh-btn:hover { background: #f3f4f6; }
        .refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .filters { display: flex; gap: 8px; margin-bottom: 12px; }
        .filters button { padding: 6px 14px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-size: 13px; }
        .filters button.active { background: #3b82f6; color: white; border-color: #3b82f6; }
        .summary { font-size: 13px; color: #6b7280; margin-bottom: 8px; }
        .log-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .log-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid #e5e7eb; background: #f9fafb; font-weight: 600; }
        .log-table td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; }
        .log-table .desc { max-width: 400px; }
        .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; }
        .badge-page_view { background: #dbeafe; color: #1d4ed8; }
        .badge-list_click { background: #dcfce7; color: #15803d; }
        .badge-item_click { background: #fef3c7; color: #92400e; }
      `}</style>
    </div>
  );
}