'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from './layout';

export default function KeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAdminAuth();

  useEffect(() => {
    fetch('/api/admin/keys', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setKeys(data.list || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <h1>密钥管理</h1>
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>名称</th>
              <th>类型</th>
              <th>状态</th>
              <th>创建时间</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.id}</td>
                <td>{k.name}</td>
                <td>{k.isMaster ? '母密钥' : '子密钥'}</td>
                <td>{k.isActive ? '活跃' : '禁用'}</td>
                <td>{new Date(k.createdAt).toLocaleDateString('zh-CN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <style>{`
        .page { padding: 20px; }
        .loading { padding: 40px; text-align: center; color: #6b7280; }
        .data-table { width: 100%; border-collapse: collapse; background: white; }
        .data-table th, .data-table td { padding: 12px; border: 1px solid #e5e7eb; text-align: left; }
        .data-table th { background: #f9fafb; font-weight: 500; }
      `}</style>
    </div>
  );
}