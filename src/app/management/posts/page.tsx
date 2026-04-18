'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from './layout';

interface Post {
  id: number;
  title: string;
  userNickname: string | null;
  userPhone: string;
  status: string;
  createdAt: string;
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { token } = useAdminAuth();

  const fetchPosts = () => {
    setLoading(true);
    fetch(`/api/admin/posts?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setPosts(data.list || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPosts(); }, [page]);

  const handleAction = async (id: number, action: string) => {
    if (!confirm(`确定执行 ${action} 操作？`)) return;
    const res = await fetch(`/api/admin/posts?id=${id}&action=${action}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    alert(data.message || data.error);
    fetchPosts();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要彻底删除这条数据吗？')) return;
    await fetch(`/api/admin/posts?id=${id}&action=permanent-delete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchPosts();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      normal: { label: '正常', color: '#10b981' },
      blocked: { label: '已屏蔽', color: '#f59e0b' },
      deleted: { label: '已删除', color: '#ef4444' },
    };
    const s = map[status] || map.normal;
    return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>;
  };

  const getActions = (status: string, id: number) => {
    if (status === 'normal') {
      return (
        <>
          <button onClick={() => handleAction(id, 'block')}>屏蔽</button>
          <button onClick={() => handleAction(id, 'soft-delete')}>删除</button>
        </>
      );
    }
    if (status === 'blocked') {
      return (
        <>
          <button onClick={() => handleAction(id, 'restore')}>恢复</button>
          <button onClick={() => handleAction(id, 'soft-delete')}>删除</button>
        </>
      );
    }
    if (status === 'deleted') {
      return (
        <>
          <button onClick={() => handleAction(id, 'restore')}>恢复</button>
          <button className="danger" onClick={() => handleDelete(id)}>彻底删除</button>
        </>
      );
    }
    return null;
  };

  const pageSize = 10;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="page">
      <div className="header">
        <h1>帖子管理</h1>
        <span className="total">共 {total} 条</span>
      </div>
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>作者</th>
                <th>状态</th>
                <th>发布时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>{post.id}</td>
                  <td className="title">{post.title}</td>
                  <td>{post.userNickname || post.userPhone}</td>
                  <td>{getStatusBadge(post.status)}</td>
                  <td>{new Date(post.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td className="actions">{getActions(post.status, post.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(1)}>首页</button>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>下一页</button>
              <button disabled={page === totalPages} onClick={() => setPage(totalPages)}>末页</button>
            </div>
          )}
        </>
      )}
      <style>{`
        .page { padding: 20px; }
        .header { display: flex; align-items: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .total { margin-left: 12px; color: #6b7280; font-size: 14px; }
        .loading { padding: 40px; text-align: center; color: #6b7280; }
        .data-table { width: 100%; border-collapse: collapse; background: white; }
        .data-table th, .data-table td { padding: 12px; border: 1px solid #e5e7eb; text-align: left; }
        .data-table th { background: #f9fafb; font-weight: 500; }
        .title { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .actions { display: flex; gap: 8px; }
        .actions button {
          padding: 4px 10px; font-size: 12px; border: 1px solid #d1d5db;
          background: white; border-radius: 4px; cursor: pointer;
        }
        .actions button:hover { background: #f3f4f6; }
        .actions button.danger { color: #ef4444; border-color: #fecaca; }
        .actions button.danger:hover { background: #fef2f2; }
        .pagination { margin-top: 16px; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .pagination button { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}