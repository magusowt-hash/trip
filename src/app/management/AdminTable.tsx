'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from './layout';

interface Column {
  key: string;
  label: string;
  render?: (row: any) => React.ReactNode;
}

interface BatchAction {
  label: string;
  value: string;
  variant?: 'default' | 'danger' | 'warning';
  confirmMessage?: string;
}

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface AdminTableProps {
  apiUrl: string;
  columns: Column[];
  title: string;
  batchActions?: BatchAction[];
  searchPlaceholder?: string;
  deleteUrl?: string;
  singleActionHandlers?: Record<string, (id: number) => Promise<void>>;
  formFields?: FormField[];
  geocodeUrl?: string;
}

export function AdminTable({ apiUrl, columns, title, batchActions = [], searchPlaceholder, deleteUrl, singleActionHandlers = {}, formFields = [], geocodeUrl }: AdminTableProps) {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchActionValue, setBatchActionValue] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [geoLoading, setGeoLoading] = useState(false);
  const { token } = useAdminAuth();

  const pageSize = 10;

  const fetchData = () => {
    setLoading(true);
    fetch(`${apiUrl}?page=${page}&search=${search}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setData(data.list || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [page]);

  const handleSearch = () => {
    setPage(1);
    fetchData();
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(data.map(item => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(itemId => itemId !== id));
    }
  };

  const handleAdd = () => {
    setShowAddModal(true);
    setFormData({});
  };

  const handleGeocode = async () => {
    const address = formData.address || formData.name;
    if (!address) {
      alert('请填写地址');
      return;
    }
    setGeoLoading(true);
    try {
      const res = await fetch(`${geocodeUrl || apiUrl}?address=${encodeURIComponent(address)}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'PATCH',
      });
      const data = await res.json();
      if (data.success && data.lng) {
        setFormData(prev => ({ ...prev, lng: data.lng, lat: data.lat }));
      } else {
        alert(data.error || '未找到坐标');
      }
    } catch (e: any) {
      alert('获取坐标失败: ' + e.message);
    }
    setGeoLoading(false);
  };

  const handleSubmit = async () => {
    const missing = formFields.filter(f => f.required && !formData[f.key]);
    if (missing.length > 0) {
      alert('请填写必填字段: ' + missing.map(f => f.label).join(', '));
      return;
    }
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success || data.id) {
        setShowAddModal(false);
        fetchData();
      } else {
        alert(data.error || '添加失败');
      }
    } catch (e: any) {
      alert('添加失败: ' + e.message);
    }
  };

  const handleBatchAction = async () => {
    if (!batchActionValue || selectedIds.length === 0) return;

    const action = batchActions.find(a => a.value === batchActionValue);
    if (!action) return;

    // Show confirmation once for the entire batch
    if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
      return;
    }

    try {
      // Handle delete via deleteUrl (batch delete)
      if (batchActionValue === 'delete' && deleteUrl) {
        await fetch(`${deleteUrl}?ids=${selectedIds.join(',')}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } 
      // Handle other actions via individual handlers
      else {
        const handler = singleActionHandlers[batchActionValue];
        if (handler) {
          // Execute sequentially to avoid overwhelming the API
          for (const id of selectedIds) {
            await handler(id);
          }
        }
      }
      
      // Reset selection and refresh data
      setSelectedIds([]);
      setBatchActionValue('');
      fetchData();
    } catch (error: any) {
      console.error('Batch action error:', error);
      alert('操作失败: ' + (error?.message || '未知错误'));
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="page">
      <div className="header">
        <h1>{title}</h1>
        <span className="total">共 {total} 条</span>
        {formFields.length > 0 && <button className="add-btn" onClick={handleAdd}>+ 添加</button>}
      </div>
      {searchPlaceholder && (
        <div className="toolbar">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch}>搜索</button>
        </div>
      )}
      {batchActions.length > 0 && (
        <div className="batch-toolbar">
          <div className="batch-actions">
            <select 
              value={batchActionValue}
              onChange={(e) => setBatchActionValue(e.target.value)}
              className="batch-select"
            >
              <option value="">批量操作</option>
              {batchActions.map(action => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
            <button onClick={handleBatchAction} className="batch-btn">
              执行
            </button>
          </div>
          <div className="selection-info">
            {selectedIds.length > 0 ? `已选中 {selectedIds.length} 项` : ''}
          </div>
        </div>
      )}
      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                {batchActions.length > 0 && (
                  <th className="select-col">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === data.length && data.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                {deleteUrl && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  {batchActions.length > 0 && (
                    <td className="select-col">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => handleSelectRow(row.id, e)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                  ))}
                  {deleteUrl && (
                    <td className="actions">
                      <button className="danger" onClick={() => {
                        if (window.confirm('确定删除？')) {
                          fetch(`${deleteUrl}?id=${row.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${token}` },
                          }).then(() => fetchData());
                        }
                      }}>删除</button>
                    </td>
                  )}
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
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>添加{title}</h2>
              <button onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {formFields.map(field => (
                <div key={field.key} className="form-field">
                  <label>{field.label}{field.required && <span className="required">*</span>}</label>
                  {field.type === 'select' ? (
                    <select 
                      value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">请选择</option>
                      {field.options?.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <div className="input-group">
                      <input 
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={formData[field.key] || ''}
                        onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                      {field.key === 'address' && (
                        <button 
                          type="button" 
                          onClick={handleGeocode}
                          disabled={geoLoading}
                        >
                          {geoLoading ? '获取中...' : '自动获取坐标'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)}>取消</button>
              <button className="primary" onClick={handleSubmit}>保存</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .page { padding: 20px; }
        .header { display: flex; align-items: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .total { margin-left: 12px; color: #6b7280; font-size: 14px; }
        .add-btn { margin-left: auto; padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .add-btn:hover { background: #059669; }
        .toolbar { display: flex; gap: 10px; margin-bottom: 16px; }
        .toolbar input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; width: 200px; }
        .toolbar button { padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .batch-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px; }
        .batch-actions { display: flex; gap: 8px; align-items: center; }
        .batch-select { padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 4px; background: white; min-width: 120px; }
        .batch-btn { padding: 6px 16px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .batch-btn:hover { background: #2563eb; }
        .selection-info { color: #6b7280; font-size: 14px; }
        .loading { padding: 40px; text-align: center; color: #6b7280; }
        .data-table { width: 100%; border-collapse: collapse; background: white; }
        .data-table th, .data-table td { padding: 12px; border: 1px solid #e5e7eb; text-align: left; }
        .data-table th { background: #f9fafb; font-weight: 500; }
        .select-col { width: 40px; text-align: center; }
        .select-col input { width: 16px; height: 16px; }
        .actions { display: flex; gap: 8px; }
        .actions button { padding: 4px 10px; font-size: 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .actions button:hover { background: #f3f4f6; }
        .actions button.danger { color: #ef4444; border-color: #fecaca; }
        .actions button.danger:hover { background: #fef2f2; }
        .pagination { margin-top: 16px; display: flex; justify-content: center; align-items: center; gap: 8px; }
        .pagination button { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .pagination button:disabled { opacity: 0.5; cursor: not-allowed; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 8px; width: 90%; max-width: 500px; max-height: 90vh; overflow: auto; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid #e5e7eb; }
        .modal-header h2 { margin: 0; font-size: 18px; }
        .modal-header button { background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; }
        .modal-body { padding: 16px; }
        .form-field { margin-bottom: 16px; }
        .form-field label { display: block; margin-bottom: 6px; font-size: 14px; font-weight: 500; }
        .form-field .required { color: #ef4444; margin-left: 4px; }
        .form-field input, .form-field select, .form-field textarea { width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
        .form-field textarea { min-height: 80px; resize: vertical; }
        .form-field .input-group { display: flex; gap: 8px; }
        .form-field .input-group input { flex: 1; }
        .form-field .input-group button { padding: 8px 12px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap; }
        .form-field .input-group button:disabled { background: #9ca3af; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; border-top: 1px solid #e5e7eb; }
        .modal-footer button { padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
        .modal-footer button.primary { background: #3b82f6; color: white; border: none; }
        .modal-footer button.primary:hover { background: #2563eb; }
      `}</style>
    </div>
  );
}