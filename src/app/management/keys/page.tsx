'use client';

import { AdminTable } from '../AdminTable';

export default function KeysPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '名称' },
    { 
      key: 'isMaster', 
      label: '类型',
      render: (row: any) => row.isMaster ? '母密钥' : '子密钥'
    },
    { 
      key: 'isActive', 
      label: '状态',
      render: (row: any) => row.isActive ? '活跃' : '禁用'
    },
    { 
      key: 'createdAt', 
      label: '创建时间',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('zh-CN')
    },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/keys"
      columns={columns}
      title="密钥管理"
    />
  );
}