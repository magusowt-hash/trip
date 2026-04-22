'use client';

import { AdminTable } from '../AdminTable';

export default function ListsPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '榜单名称' },
    { key: 'description', label: '描述' },
    { 
      key: 'status',
      label: '状态',
      render: (row: any) => {
        const map: Record<string, { label: string; color: string }> = {
          '1': { label: '启用', color: '#10b981' },
          '0': { label: '禁用', color: '#ef4444' },
        };
        const s = map[row.status] || map['1'];
        return <span style={{ color: s.color, fontWeight: 500 }}>{s.label}</span>;
      }
    },
    { 
      key: 'createdAt', 
      label: '创建时间',
      render: (row: any) => row.createdAt ? new Date(row.createdAt).toLocaleDateString('zh-CN') : '-'
    },
  ];

  const formFields = [
    { key: 'name', label: '榜单名称', type: 'text', required: true },
    { key: 'description', label: '描述', type: 'textarea' },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/lists"
      columns={columns}
      title="榜单管理"
      formFields={formFields}
      deleteUrl="/api/admin/lists"
      searchPlaceholder="搜索榜单名称"
    />
  );
}