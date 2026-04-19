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

interface AdminTableProps {
  apiUrl: string;
  columns: Column[];
  title: string;
  batchActions?: BatchAction[];
  searchPlaceholder?: string;
  deleteUrl?: string;
  singleActionHandlers?: Record<string, (id: number) => Promise<void>>;
}

export function AdminTable({ apiUrl, columns, title, batchActions = [], searchPlaceholder, deleteUrl, singleActionHandlers = {} }: AdminTableProps) {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchActionValue, setBatchActionValue] = useState<string>('');
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
      <style>{`
        .page { padding: 20px; }
        .header { display: flex; align-items: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 20px; }
        .total { margin-left: 12px; color: #6b7280; font-size: 14px; }
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
      `}</style>
    </div>
  );
}