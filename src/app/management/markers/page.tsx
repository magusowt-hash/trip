'use client';

import { AdminTable } from '../AdminTable';
import { useState } from 'react';

export default function MarkersPage() {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '名称' },
    { key: 'lng', label: '经度' },
    { key: 'lat', label: '纬度' },
    { key: 'address', label: '地址' },
    { key: 'type', label: '类型' },
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
    { key: 'name', label: '名称', type: 'text', required: true },
    { key: 'lng', label: '经度', type: 'text', placeholder: '如：116.397428' },
    { key: 'lat', label: '纬度', type: 'text', placeholder: '如：39.90923' },
    { key: 'address', label: '地址', type: 'text' },
    { key: 'description', label: '描述', type: 'textarea' },
    { 
      key: 'type', 
      label: '类型', 
      type: 'select',
      options: [
        { value: 'spot', label: '景点' },
        { value: 'hotel', label: '酒店' },
        { value: 'restaurant', label: '餐厅' },
        { value: 'other', label: '其他' },
      ]
    },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/markers"
      columns={columns}
      title="标记点管理"
      formFields={formFields}
      deleteUrl="/api/admin/markers"
      searchPlaceholder="搜索名称或地址"
    />
  );
}