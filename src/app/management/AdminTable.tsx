'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from './admin-auth';
import styles from './AdminTable.module.css';

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

export interface FormField {
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
      setSelectedIds(data.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
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
        setFormData((prev) => ({ ...prev, lng: data.lng, lat: data.lat }));
      } else {
        alert(data.error || '未找到坐标');
      }
    } catch (e: any) {
      alert('获取坐标失败: ' + e.message);
    }
    setGeoLoading(false);
  };

  const handleSubmit = async () => {
    const missing = formFields.filter((f) => f.required && !formData[f.key]);
    if (missing.length > 0) {
      alert('请填写必填字段: ' + missing.map((f) => f.label).join(', '));
      return;
    }
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

    const action = batchActions.find((a) => a.value === batchActionValue);
    if (!action) return;

    if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
      return;
    }

    try {
      if (batchActionValue === 'delete' && deleteUrl) {
        await fetch(`${deleteUrl}?ids=${selectedIds.join(',')}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        const handler = singleActionHandlers[batchActionValue];
        if (handler) {
          for (const id of selectedIds) {
            await handler(id);
          }
        }
      }

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
    <div className={styles.page}>
      {searchPlaceholder ? (
        <section className={styles.toolbarCard}>
          <div className={styles.toolbar}>
            <div className={styles.searchBox}>
              <input
                className={styles.input}
                type="text"
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <button className={styles.primaryButton} onClick={handleSearch}>搜索</button>
            {formFields.length > 0 ? <button className={styles.addButton} onClick={handleAdd}>新增</button> : null}
          </div>
        </section>
      ) : formFields.length > 0 ? (
        <section className={styles.toolbarCard}>
          <div className={styles.toolbar}>
            <div />
            <button className={styles.addButton} onClick={handleAdd}>新增</button>
          </div>
        </section>
      ) : null}

      {batchActions.length > 0 ? (
        <section className={styles.toolbarCard}>
          <div className={styles.batchToolbar}>
            <div className={styles.batchActions}>
              <select
                value={batchActionValue}
                onChange={(e) => setBatchActionValue(e.target.value)}
                className={styles.select}
              >
                <option value="">批量操作</option>
                {batchActions.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>
              <button onClick={handleBatchAction} className={styles.primaryButton}>执行</button>
            </div>
            <div className={styles.selectionInfo}>
              {selectedIds.length > 0 ? `已选中 ${selectedIds.length} 项` : '未选择任何数据'}
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.tableCard}>
        {loading ? (
          <div className={styles.loading}>加载中...</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {batchActions.length > 0 ? (
                      <th className={styles.selectCol}>
                        <input
                          type="checkbox"
                          checked={selectedIds.length === data.length && data.length > 0}
                          onChange={handleSelectAll}
                        />
                      </th>
                    ) : null}
                    {columns.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    {deleteUrl ? <th>操作</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id}>
                      {batchActions.length > 0 ? (
                        <td className={styles.selectCol}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(row.id)}
                            onChange={(e) => handleSelectRow(row.id, e)}
                          />
                        </td>
                      ) : null}
                      {columns.map((col) => (
                        <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                      ))}
                      {deleteUrl ? (
                        <td className={styles.actions}>
                          <button
                            className={styles.dangerButton}
                            onClick={() => {
                              if (window.confirm('确定删除？')) {
                                fetch(`${deleteUrl}?id=${row.id}`, {
                                  method: 'DELETE',
                                  headers: { Authorization: `Bearer ${token}` },
                                }).then(() => fetchData());
                              }
                            }}
                          >
                            删除
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className={styles.pagination}>
                <button className={styles.paginationButton} disabled={page === 1} onClick={() => setPage(1)}>首页</button>
                <button className={styles.paginationButton} disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
                <span className={styles.paginationStatus}>{page} / {totalPages}</span>
                <button className={styles.paginationButton} disabled={page === totalPages} onClick={() => setPage(page + 1)}>下一页</button>
                <button className={styles.paginationButton} disabled={page === totalPages} onClick={() => setPage(totalPages)}>末页</button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {showAddModal ? (
        <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>添加{title}</h2>
              <button className={styles.modalClose} onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              {formFields.map((field) => (
                <div key={field.key} className={styles.formField}>
                  <label>{field.label}{field.required ? <span className={styles.required}>*</span> : null}</label>
                  {field.type === 'select' ? (
                    <select
                      className={styles.select}
                      value={formData[field.key] || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    >
                      <option value="">请选择</option>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      className={styles.textarea}
                      value={formData[field.key] || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                    />
                  ) : (
                    <div className={styles.inputGroup}>
                      <input
                        className={styles.input}
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                      />
                      {field.key === 'address' ? (
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={handleGeocode}
                          disabled={geoLoading}
                        >
                          {geoLoading ? '获取中...' : '自动获取坐标'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.ghostButton} onClick={() => setShowAddModal(false)}>取消</button>
              <button className={styles.primaryButton} onClick={handleSubmit}>保存</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
