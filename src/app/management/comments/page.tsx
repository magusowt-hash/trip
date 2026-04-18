'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from './layout';

interface Comment {
  id: number;
  content: string;
  userNickname: string | null;
  userPhone: string;
  postTitle: string;
  status: string;
  createdAt: string;
}

export default function CommentsPage() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const { token } = useAdminAuth();

  const fetchComments = () => {
    setLoading(true);
    fetch(`/api/admin/comments?page=${page}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setComments(data.list || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchComments(); }, [page]);

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这条评论？')) return;
    await fetch(`/api/admin/comments?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchComments();
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('确定彻底删除这条评论吗？此操作不可恢复！')) return;
    await fetch(`/api/admin/comments?id=${id}&action=permanent-delete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchComments();
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      normal: { label: '正常', color: '#10b981' },
      deleted: { label: '已删除', color: '#ef4444' },
    };
    const s = map[status] || map.normal;
    return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>;
  };

  const pageSize = 10;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="page">
      <div className="header">
        <h1>评论管理</h1>
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
                <th>内容</th>
                <th>作者</th>
                <th>帖子</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td className="content">{c.content}</td>
                  <td>{c.userNickname || c.userPhone}</td>
                  <td>{c.postTitle}</td>
                  <td>{getStatusBadge(c.status)}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td className="actions">
                    {c.status === 'normal' ? (
                      <button onClick={() => handleDelete(c.id)}>删除</button>
                    ) : (
                      <button className="danger" onClick={() => handlePermanentDelete(c.id)}>彻底删除</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
              <span>{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(page + 1)}>下一页</button>
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
        .content { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .actions button { padding: 4px 10px; font-size: 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .actions button.danger { color: #ef4444; border-color: #fecaca; }
        .pagination { margin-top: 16px; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .pagination button { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}