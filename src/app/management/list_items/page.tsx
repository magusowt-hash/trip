'use client';

import { useState, useEffect } from 'react';
import { AdminTable } from '../AdminTable';

export default function ListItemsPage() {
  const [lists, setLists] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin/lists')
      .then(res => res.json())
      .then(data => {
        if (data.list) setLists(data.list);
      });
  }, []);

  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'title', label: '标题' },
    { 
      key: 'cover_image', 
      label: '封面',
      render: (row: any) => row.cover_image ? <img src={row.cover_image} style={{width: 60, height: 40, objectFit: 'cover', borderRadius: 4}} /> : '-'
    },
    { key: 'address', label: '地址' },
    { key: 'order_num', label: '排序' },
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
  ];

  const listOptions = lists.map(l => ({ value: String(l.id), label: l.name }));

  const formFields = [
    { key: 'list_id', label: '所属榜单', type: 'select', required: true, options: listOptions },
    { key: 'title', label: '标题', type: 'text', required: true },
    { key: 'cover_image', label: '封面图片', type: 'text', placeholder: '图片URL' },
    { key: 'description', label: '描述', type: 'textarea' },
    { key: 'lng', label: '经度', type: 'text', placeholder: '如：116.397428' },
    { key: 'lat', label: '纬度', type: 'text', placeholder: '如：39.90923' },
    { key: 'address', label: '地址', type: 'text' },
    { key: 'order_num', label: '排序', type: 'text', placeholder: '数字越小越靠前' },
  ];

  return (
    <AdminTable
      apiUrl="/api/admin/list_items"
      columns={columns}
      title="榜单项管理"
      formFields={formFields}
      deleteUrl="/api/admin/list_items"
      searchPlaceholder="搜索标题或地址"
    />
  );
}