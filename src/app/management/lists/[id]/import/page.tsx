'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminAuth } from '../../../admin-auth';

export default function ImportPage() {
  const router = useRouter();
  const params = useParams();
  const listId = Number(params.id);
  const [jsonData, setJsonData] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { token } = useAdminAuth();

  const example = `[
  {
    "title": "故宫博物院",
    "description": "世界上现存规模最大、保存最为完整的木质结构古建筑之一",
    "cover_image": "https://example.com/image.jpg",
    "lng": "116.397058",
    "lat": "39.916520"
  }
]`;

  const handleImport = async () => {
    let items;
    try {
      items = JSON.parse(jsonData);
    } catch (e) {
      alert('JSON格式错误');
      return;
    }

    if (!Array.isArray(items)) {
      alert('请输入数组格式');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch('/api/admin/list_items/import', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ list_id: listId, items }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      alert('导入失败');
    }
    setImporting(false);
  };

  const loadExample = () => {
    setJsonData(example);
  };

  return (
    <div className="page">
      <div className="header">
        <button className="back-btn" onClick={() => router.push(`/management/lists/${listId}`)}>← 返回</button>
        <h1>批量导入数据</h1>
      </div>

      <div className="section">
        <p className="hint">请输入JSON数组格式的导入数据：</p>
        <textarea 
          className="json-input"
          value={jsonData}
          onChange={e => setJsonData(e.target.value)}
          placeholder={example}
        />
        <div className="actions">
          <button onClick={loadExample}>加载示例</button>
          <button className="primary" onClick={handleImport} disabled={importing}>
            {importing ? '导入中...' : '导入'}
          </button>
        </div>
      </div>

      {result && (
        <div className="result">
          成功导入 {result.count} 条数据
        </div>
      )}

      <div className="fields-docs">
        <h3>字段说明</h3>
        <table>
          <thead>
            <tr>
              <th>字段</th>
              <th>类型</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>title</td><td>string</td><td>标题 *必填</td></tr>
            <tr><td>description</td><td>string</td><td>描述</td></tr>
            <tr><td>cover_image</td><td>string</td><td>封面图片URL</td></tr>
            <tr><td>lng</td><td>string</td><td>经度</td></tr>
            <tr><td>lat</td><td>string</td><td>纬度</td></tr>
            <tr><td>address</td><td>string</td><td>地址</td></tr>
            <tr><td>order_num</td><td>number</td><td>排序号</td></tr>
          </tbody>
        </table>
      </div>

      <style>{`
        .page { padding: 20px; max-width: 800px; margin: 0 auto; }
        .header { margin-bottom: 20px; }
        .back-btn { background: none; border: none; color: #3b82f6; cursor: pointer; margin-right: 12px; }
        .header h1 { margin: 0; display: inline; font-size: 20px; }
        
        .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .hint { margin: 0 0 12px; color: #6b7280; font-size: 14px; }
        
        .json-input { 
          width: 100%; 
          min-height: 300px; 
          padding: 12px; 
          border: 1px solid #d1d5db; 
          border-radius: 8px; 
          font-family: monospace; 
          font-size: 13px;
          resize: vertical;
          box-sizing: border-box;
        }
        
        .actions { display: flex; gap: 12px; margin-top: 12px; justify-content: flex-end; }
        .actions button { padding: 10px 20px; border-radius: 6px; cursor: pointer; border: 1px solid #d1d5db; background: white; }
        .actions button.primary { background: #3b82f6; color: white; border: none; }
        .actions button:disabled { opacity: 0.6; cursor: not-allowed; }
        
        .result { padding: 12px; background: #dcfce7; color: #166534; border-radius: 8px; margin-bottom: 20px; }
        
        .fields-docs { background: white; border-radius: 12px; padding: 20px; }
        .fields-docs h3 { margin: 0 0 12px; font-size: 16px; }
        .fields-docs table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .fields-docs th, .fields-docs td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        .fields-docs th { background: #f9fafb; font-weight: 600; }
      `}</style>
    </div>
  );
}