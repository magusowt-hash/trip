'use client';

import { AdminTable } from '../AdminTable';

export default function PlansPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '计划名称' },
    { 
      key: 'user', 
      label: '用户',
      render: (row: any) => row.userNickname || row.userPhone || '-'
    },
    { key: 'startDate', label: '开始日期', render: (row: any) => row.startDate || '-' },
    { key: 'endDate', label: '结束日期', render: (row: any) => row.endDate || '-' },
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
      label: '创建时间',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('zh-CN')
    },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/plans"
      columns={columns}
      title="旅行计划"
      deleteUrl="/api/admin/plans"
    />
  );
}