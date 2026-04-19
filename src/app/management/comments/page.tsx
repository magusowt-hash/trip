'use client';

import { AdminTable } from '../AdminTable';

export default function CommentsPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { 
      key: 'content', 
      label: '内容',
      render: (row: any) => <span className="content-cell">{row.content}</span>
    },
    { 
      key: 'author', 
      label: '作者',
      render: (row: any) => row.userNickname || row.userPhone || '-'
    },
    { 
      key: 'post', 
      label: '帖子',
      render: (row: any) => row.postTitle || '-'
    },
    { 
      key: 'status',
      label: '状态',
      render: (row: any) => {
        const map: Record<string, { label: string; color: string }> = {
          normal: { label: '正常', color: '#10b981' },
          deleted: { label: '已删除', color: '#ef4444' },
        };
        const s = map[row.status] || map.normal;
        return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>;
      }
    },
    { 
      key: 'createdAt', 
      label: '时间',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('zh-CN')
    },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/comments"
      columns={columns}
      title="评论管理"
      deleteUrl="/api/admin/comments"
    />
  );
}