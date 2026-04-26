'use client';

import { AdminTable } from '../AdminTable';

export default function UsersPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { 
      key: 'nickname', 
      label: '昵称',
      render: (row: any) => row.nickname || '-'
    },
    { key: 'phone', label: '手机号' },
    { 
      key: 'gender', 
      label: '性别',
      render: (row: any) => row.gender === 1 ? '男' : row.gender === 2 ? '女' : '-'
    },
    {
      key: 'ratingsCnt',
      label: '评分',
      render: (row: any) => row.ratingsCnt != null ? `${row.ratingsCnt} 条` : '-'
    },
    {
      key: 'createdAt', 
      label: '注册时间',
      render: (row: any) => new Date(row.createdAt).toLocaleDateString('zh-CN')
    },
    {
      key: 'actions',
      label: '操作',
      render: (row: any) => (
        <a href={`/management/users/${row.id}`} style={{ color: '#3b82f6', textDecoration: 'none' }}>查看详情</a>
      ),
    },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/users"
      columns={columns}
      title="用户管理"
      searchPlaceholder="搜索手机号..."
      deleteUrl="/api/admin/users"
    />
  );
}