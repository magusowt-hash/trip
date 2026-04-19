'use client';

import { AdminTable } from '../AdminTable';

export default function PostsPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { 
      key: 'title', 
      label: '标题',
      render: (row: any) => <span className="title-cell">{row.title}</span>
    },
    { 
      key: 'author', 
      label: '作者',
      render: (row: any) => row.userNickname || row.userPhone || '-'
    },
    { 
      key: 'status',
      label: '状态',
      render: (row: any) => {
        const map: Record<string, { label: string; color: string }> = {
          normal: { label: '正常', color: '#10b981' },
          blocked: { label: '已屏蔽', color: '#f59e0b' },
          deleted: { label: '已删除', color: '#ef4444' },
        };
        const s = map[row.status] || map.normal;
        return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>;
      }
    },
    { 
      key: 'createdAt', 
      label: '发布时间',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('zh-CN')
    },
  ];

  const singleActionHandlers = {
    block: async (id: number) => {
      if (!window.confirm('确定要屏蔽这篇帖子？')) return;
      const res = await fetch(`/api/admin/posts?id=${id}&action=block`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      if (!res.ok) throw new Error('操作失败');
    },
    restore: async (id: number) => {
      if (!window.confirm('确定要恢复这篇帖子？')) return;
      const res = await fetch(`/api/admin/posts?id=${id}&action=restore`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      if (!res.ok) throw new Error('操作失败');
    },
    'soft-delete': async (id: number) => {
      if (!window.confirm('确定要删除这篇帖子？')) return;
      const res = await fetch(`/api/admin/posts?id=${id}&action=soft-delete`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      if (!res.ok) throw new Error('操作失败');
    },
    'permanent-delete': async (id: number) => {
      if (!window.confirm('确定要彻底删除这篇帖子？此操作不可恢复！')) return;
      const res = await fetch(`/api/admin/posts?id=${id}&action=permanent-delete`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      });
      if (!res.ok) throw new Error('操作失败');
    },
  };

  return (
    <AdminTable
      apiUrl="/api/admin/posts"
      columns={columns}
      title="帖子管理"
      batchActions={[
        { label: '批量屏蔽', value: 'block', variant: 'warning', confirmMessage: '确定要批量屏蔽选中的帖子吗？' },
        { label: '批量恢复', value: 'restore', variant: 'default', confirmMessage: '确定要批量恢复选中的帖子吗？' },
        { label: '批量删除', value: 'soft-delete', variant: 'danger', confirmMessage: '确定要批量删除选中的帖子吗？' },
        { label: '批量彻底删除', value: 'permanent-delete', variant: 'danger', confirmMessage: '确定要批量彻底删除选中的帖子吗？此操作不可恢复！' },
      ]}
      deleteUrl="/api/admin/posts"
      singleActionHandlers={singleActionHandlers}
    />
  );
}