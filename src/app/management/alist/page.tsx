'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../admin-auth';

export default function AlistConfigPage() {
  const { token } = useAdminAuth();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rootPath, setRootPath] = useState('/');
  const [enabled, setEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/admin/alist/config', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setUrl(data.config.url || '');
          setUsername(data.config.username || '');
          setPassword('');
          setRootPath(data.config.rootPath || '/');
          setEnabled(data.config.enabled === 1);
        }
      });
  }, [token]);

  async function handleSave() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/alist/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url, username, password: password || undefined, root_path: rootPath, enabled }),
      });
      const data = await res.json();
      setMessage(data.success ? '保存成功' : '保存失败');
    } catch { setMessage('保存失败'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/alist/config', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTestResult(data.connected);
    } catch { setTestResult(false); }
    finally { setTesting(false); }
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 14, border: '1px solid #d1d5db',
    borderRadius: 8, outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>网盘配置</h1>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>AList 地址</label>
        <input style={inputStyle} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://alist.example.com" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>用户名</label>
        <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>密码</label>
        <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={password ? '' : '不填则不修改'} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>根路径</label>
        <input style={inputStyle} value={rootPath} onChange={e => setRootPath(e.target.value)} placeholder="/" />
      </div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        <label htmlFor="enabled" style={{ fontSize: 14 }}>启用</label>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '10px 24px', fontSize: 14, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {saving ? '保存中...' : '保存'}
        </button>
        <button onClick={handleTest} disabled={testing}
          style={{ padding: '10px 24px', fontSize: 14, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          {testing ? '测试中...' : '测试连接'}
        </button>
      </div>

      {testResult !== null && (
        <div style={{ padding: 12, borderRadius: 8, background: testResult ? '#ecfdf5' : '#fef2f2', color: testResult ? '#059669' : '#ef4444', fontSize: 14 }}>
          {testResult ? '✅ 连接成功' : '❌ 连接失败，请检查配置'}
        </div>
      )}
      {message && (
        <div style={{ marginTop: 8, padding: 8, borderRadius: 6, background: '#f3f4f6', color: '#374151', fontSize: 13 }}>{message}</div>
      )}
    </div>
  );
}
